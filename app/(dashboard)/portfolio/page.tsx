'use client';

import { useRef, useState } from 'react';
import {
    Stack, Text, Group, Paper, Table, Badge, Button, ActionIcon, Tooltip, SimpleGrid, Alert, Menu,
    Modal, NumberInput, Anchor,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
    IconPlus, IconTrash, IconRefresh, IconDownload, IconUpload, IconDots, IconPencil,
    IconArrowUpRight, IconArrowDownRight, IconAlertTriangle, IconDatabase,
} from '@tabler/icons-react';
import { ASSET_TYPE_LABELS, AssetType, Holding, sortTrades } from '@/lib/portfolio';
import { portfolioActions, usePortfolio, usePriceRefresh, useStoreReady } from '@/lib/portfolio-store';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/format';
import TradeModal, { TradePreset } from '@/components/portfolio/TradeModal';

const TYPE_COLORS: Record<AssetType, string> = {
    stock: 'blue', etf: 'indigo', gold: 'yellow', forex: 'teal', crypto: 'grape', fund: 'cyan',
};

const cardStyle = { background: 'var(--wp-bg-card)', border: '1px solid var(--wp-border)' };
const tableStyles = {
    th: { color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    td: { fontSize: 13, padding: '10px 12px', borderBottom: '1px solid var(--wp-border)' },
};

function Pnl({ value, pct }: { value: number; pct?: number | null }) {
    const up = value >= 0;
    return (
        <Group gap={4} justify="flex-end" wrap="nowrap">
            {up ? <IconArrowUpRight size={14} color="#22c55e" /> : <IconArrowDownRight size={14} color="#ef4444" />}
            <Text fw={600} size="sm" c={up ? 'green' : 'red'}>
                {formatCurrency(value)}
                {pct !== undefined && pct !== null && <Text span size="xs"> ({formatPercent(pct)})</Text>}
            </Text>
        </Group>
    );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <Paper p="md" radius="md" style={cardStyle}>
            <Text size="xs" c="dimmed" tt="uppercase" fw={600} lts={0.5} mb={4}>{label}</Text>
            {children}
        </Paper>
    );
}

export default function PortfolioPage() {
    const { state, summary } = usePortfolio();
    const prices = usePriceRefresh();
    const ready = useStoreReady();
    const [tradeOpened, tradeModal] = useDisclosure(false);
    const [preset, setPreset] = useState<TradePreset | undefined>();
    const [priceTarget, setPriceTarget] = useState<Holding | null>(null);
    const [manualPrice, setManualPrice] = useState<number | string>('');
    const fileRef = useRef<HTMLInputElement>(null);

    const openTrade = (p?: TradePreset) => {
        setPreset(p);
        tradeModal.open();
    };

    const deleteTrade = (id: string, label: string) => {
        modals.openConfirmModal({
            title: 'İşlemi sil',
            centered: true,
            children: <Text size="sm">{label} işlemini silmek istediğinize emin misiniz?</Text>,
            labels: { confirm: 'Sil', cancel: 'İptal' },
            confirmProps: { color: 'red' },
            onConfirm: () => {
                const errors = portfolioActions.deleteTrade(id);
                if (errors.length) notifications.show({ title: 'Silinemedi', message: errors.join(' '), color: 'red' });
            },
        });
    };

    const exportBackup = () => {
        const blob = new Blob([portfolioActions.exportJson()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wealthpulse-yedek-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const importBackup = async (file: File) => {
        const text = await file.text();
        modals.openConfirmModal({
            title: 'Yedeği geri yükle',
            centered: true,
            children: <Text size="sm">Mevcut tüm işlemler ve fiyatlar, yedekteki verilerle <b>değiştirilecek</b>. Devam edilsin mi?</Text>,
            labels: { confirm: 'Geri yükle', cancel: 'İptal' },
            confirmProps: { color: 'orange' },
            onConfirm: () => {
                const err = portfolioActions.importJson(text);
                notifications.show(err
                    ? { title: 'Geri yüklenemedi', message: err, color: 'red' }
                    : { title: 'Yedek yüklendi', message: 'Portföy yedekten geri yüklendi.', color: 'green' });
            },
        });
    };

    const saveManualPrice = () => {
        if (!priceTarget || !(Number(manualPrice) > 0)) return;
        const currency = priceTarget.quote?.currency ?? priceTarget.currency;
        portfolioActions.setManualPrice(priceTarget.type, priceTarget.symbol, Number(manualPrice), currency);
        setPriceTarget(null);
    };

    const trades = sortTrades(state.trades).reverse();
    const missing = new Set(prices.missing);

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="center">
                <div>
                    <Text size="xl" fw={800}>Portföy</Text>
                    <Text size="xs" c="dimmed">
                        {prices.updatedAt
                            ? `Fiyatlar: ${new Date(prices.updatedAt).toLocaleString('tr-TR')}`
                            : 'Henüz fiyat alınmadı'}
                    </Text>
                </div>
                <Group gap="xs">
                    <Tooltip label="Fiyatları yenile">
                        <ActionIcon variant="light" size="lg" onClick={() => void prices.refresh()} loading={prices.loading}>
                            <IconRefresh size={18} />
                        </ActionIcon>
                    </Tooltip>
                    <Menu position="bottom-end">
                        <Menu.Target>
                            <ActionIcon variant="light" size="lg" aria-label="Yedekleme"><IconDots size={18} /></ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>Yedekleme</Menu.Label>
                            <Menu.Item leftSection={<IconDownload size={14} />} onClick={exportBackup}>Yedeği indir (JSON)</Menu.Item>
                            <Menu.Item leftSection={<IconUpload size={14} />} onClick={() => fileRef.current?.click()}>Yedekten geri yükle</Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                    <input
                        ref={fileRef}
                        type="file"
                        accept="application/json,.json"
                        hidden
                        onChange={e => {
                            const f = e.currentTarget.files?.[0];
                            e.currentTarget.value = '';
                            if (f) void importBackup(f);
                        }}
                    />
                    <Button leftSection={<IconPlus size={16} />} onClick={() => openTrade()} size="sm">İşlem Ekle</Button>
                </Group>
            </Group>

            {prices.error && (
                <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>{prices.error}</Alert>
            )}
            {summary.unpricedCount > 0 && (
                <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />}>
                    {summary.unpricedCount} varlık için güncel fiyat yok; bu varlıklar maliyet değeriyle hesaba katılıyor.
                    Tablodaki <IconPencil size={12} /> simgesiyle fiyatı elle girebilirsiniz.
                </Alert>
            )}

            <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
                <Stat label="Toplam değer">
                    <Text fw={800} size="xl">{formatCurrency(summary.totalValue)}</Text>
                    {summary.dayChangePct !== null && summary.dayChange !== 0 && (
                        <Text size="xs" c={summary.dayChange >= 0 ? 'green' : 'red'}>
                            Bugün {formatCurrency(summary.dayChange)} ({formatPercent(summary.dayChangePct)})
                        </Text>
                    )}
                </Stat>
                <Stat label="Maliyet">
                    <Text fw={800} size="xl">{formatCurrency(summary.totalCost)}</Text>
                </Stat>
                <Stat label="Gerçekleşmemiş K/Z">
                    <Text fw={800} size="xl" c={summary.unrealizedPnl >= 0 ? 'green' : 'red'}>{formatCurrency(summary.unrealizedPnl)}</Text>
                    {summary.unrealizedPnlPct !== null && (
                        <Text size="xs" c={summary.unrealizedPnl >= 0 ? 'green' : 'red'}>{formatPercent(summary.unrealizedPnlPct)}</Text>
                    )}
                </Stat>
                <Stat label="Gerçekleşen K/Z">
                    <Text fw={800} size="xl" c={summary.realizedPnl >= 0 ? 'green' : 'red'}>{formatCurrency(summary.realizedPnl)}</Text>
                </Stat>
            </SimpleGrid>

            <Paper p="md" radius="md" style={cardStyle}>
                <Text fw={700} size="sm" c="dimmed" mb="sm">Varlıklar</Text>
                {!ready ? null : summary.holdings.length === 0 ? (
                    <Stack align="center" py="xl" gap="xs">
                        <IconDatabase size={32} color="#64748b" />
                        <Text c="dimmed" ta="center">Henüz varlık yok. İlk alışınızı &ldquo;İşlem Ekle&rdquo; ile girin.</Text>
                        <Text c="dimmed" size="xs" ta="center">Veriler yalnızca bu cihazda saklanır; düzenli olarak yedek almanızı öneririz.</Text>
                    </Stack>
                ) : (
                    <Table.ScrollContainer minWidth={960}>
                        <Table highlightOnHover styles={tableStyles}>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Varlık</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Miktar</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Ort. maliyet (₺)</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Güncel fiyat</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Değer (₺)</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Kâr / Zarar</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Ağırlık</Table.Th>
                                    <Table.Th style={{ width: 110 }} />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {summary.holdings.map(h => (
                                    <Table.Tr key={h.key}>
                                        <Table.Td>
                                            <Group gap={8} wrap="nowrap">
                                                <Badge size="xs" variant="light" color={TYPE_COLORS[h.type]}>{ASSET_TYPE_LABELS[h.type]}</Badge>
                                                <div>
                                                    <Text fw={700} size="sm">{h.type === 'gold' ? h.name : h.symbol}</Text>
                                                    {h.type !== 'gold' && <Text size="xs" c="dimmed">{h.name}</Text>}
                                                </div>
                                            </Group>
                                        </Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>{formatNumber(h.quantity, 8)}</Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>{formatCurrency(h.avgCost)}</Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>
                                            {h.quote ? (
                                                <Stack gap={0} align="flex-end">
                                                    <Text size="sm" fw={600}>{formatCurrency(h.quote.price, h.quote.currency)}</Text>
                                                    {h.quote.source === 'manual'
                                                        ? <Text size="xs" c="dimmed">elle · {new Date(h.quote.asOf).toLocaleDateString('tr-TR')}</Text>
                                                        : missing.has(h.key)
                                                            ? <Text size="xs" c="orange">son bilinen</Text>
                                                            : h.quote.changePercent !== 0 && (
                                                                <Text size="xs" c={h.quote.changePercent >= 0 ? 'green' : 'red'}>{formatPercent(h.quote.changePercent)}</Text>
                                                            )}
                                                </Stack>
                                            ) : (
                                                <Text size="xs" c="yellow">fiyat yok</Text>
                                            )}
                                        </Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }} fw={600}>{formatCurrency(h.marketValue)}</Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>
                                            {h.quote ? <Pnl value={h.unrealizedPnl} pct={h.unrealizedPnlPct} /> : <Text size="xs" c="dimmed">—</Text>}
                                        </Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>{h.weight.toFixed(1)}%</Table.Td>
                                        <Table.Td>
                                            <Group gap={2} justify="flex-end" wrap="nowrap">
                                                <Tooltip label="Fiyatı elle gir">
                                                    <ActionIcon variant="subtle" size="sm" color="gray" onClick={() => { setPriceTarget(h); setManualPrice(h.quote?.price ?? ''); }}>
                                                        <IconPencil size={14} />
                                                    </ActionIcon>
                                                </Tooltip>
                                                <Button size="compact-xs" variant="subtle" color="teal" onClick={() => openTrade({ side: 'buy', type: h.type, symbol: h.symbol, name: h.name, currency: h.currency })}>Al</Button>
                                                <Button size="compact-xs" variant="subtle" color="red" onClick={() => openTrade({ side: 'sell', type: h.type, symbol: h.symbol, name: h.name, currency: h.currency })}>Sat</Button>
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}
            </Paper>

            {trades.length > 0 && (
                <Paper p="md" radius="md" style={cardStyle}>
                    <Group justify="space-between" mb="sm">
                        <Text fw={700} size="sm" c="dimmed">İşlem geçmişi ({trades.length})</Text>
                        {summary.closed.length > 0 && (
                            <Text size="xs" c="dimmed">Kapanan pozisyonlar: {summary.closed.map(h => h.symbol).join(', ')}</Text>
                        )}
                    </Group>
                    <Table.ScrollContainer minWidth={760}>
                        <Table highlightOnHover styles={tableStyles}>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Tarih</Table.Th>
                                    <Table.Th>İşlem</Table.Th>
                                    <Table.Th>Varlık</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Miktar</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Fiyat</Table.Th>
                                    <Table.Th style={{ textAlign: 'right' }}>Tutar (₺)</Table.Th>
                                    <Table.Th style={{ width: 40 }} />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {trades.map(t => (
                                    <Table.Tr key={t.id}>
                                        <Table.Td c="dimmed">{new Date(t.date + 'T00:00:00').toLocaleDateString('tr-TR')}</Table.Td>
                                        <Table.Td>
                                            <Badge size="sm" variant="light" color={t.side === 'buy' ? 'teal' : 'red'}>{t.side === 'buy' ? 'ALIŞ' : 'SATIŞ'}</Badge>
                                        </Table.Td>
                                        <Table.Td fw={600}>{t.type === 'gold' ? t.name : t.symbol}</Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>{formatNumber(t.quantity, 8)}</Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>{formatCurrency(t.price, t.currency)}</Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>{formatCurrency(t.quantity * t.price * t.fxRate)}</Table.Td>
                                        <Table.Td>
                                            <ActionIcon variant="subtle" color="red" size="sm" aria-label="İşlemi sil"
                                                onClick={() => deleteTrade(t.id, `${t.date} ${t.side === 'buy' ? 'alış' : 'satış'} — ${t.symbol}`)}>
                                                <IconTrash size={14} />
                                            </ActionIcon>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Paper>
            )}

            {summary.holdings.length > 0 && (
                <Text size="xs" c="dimmed">
                    Maliyet ağırlıklı ortalama yöntemiyle, işlem günü kuruyla TL bazında hesaplanır. Altın ve döviz,
                    kuyumcu/banka alış fiyatıyla değerlenir. Gelecek senaryoları için{' '}
                    <Anchor href="/simulator" size="xs">Simülasyon</Anchor> sayfasına bakın.
                </Text>
            )}

            <TradeModal opened={tradeOpened} onClose={tradeModal.close} preset={preset} />

            <Modal opened={priceTarget !== null} onClose={() => setPriceTarget(null)} title="Fiyatı elle gir" centered size="sm">
                {priceTarget && (
                    <Stack gap="sm">
                        <Text size="sm">{priceTarget.name} ({priceTarget.symbol})</Text>
                        <NumberInput
                            label={`Birim fiyat (${priceTarget.quote?.currency ?? priceTarget.currency})`}
                            value={manualPrice}
                            onChange={setManualPrice}
                            min={0}
                            decimalScale={6}
                            thousandSeparator="."
                            decimalSeparator=","
                            data-autofocus
                        />
                        <Text size="xs" c="dimmed">Canlı fiyat geldiğinde elle girilen fiyatın yerini alır.</Text>
                        <Button onClick={saveManualPrice} disabled={!(Number(manualPrice) > 0)}>Kaydet</Button>
                    </Stack>
                )}
            </Modal>
        </Stack>
    );
}
