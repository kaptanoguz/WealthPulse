'use client';

import { useMemo, useRef, useState } from 'react';
import {
    Text, Group, Button, ActionIcon, Tooltip, Menu, Modal, NumberInput, Stack, SegmentedControl, Skeleton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
    IconPlus, IconTrash, IconDownload, IconUpload, IconDots, IconAlertTriangle,
} from '@tabler/icons-react';
import { ASSET_TYPE_LABELS, AssetType, Holding, sortTrades } from '@/lib/portfolio';
import { downloadBackup, portfolioActions, usePortfolio, usePriceStatus, useStoreReady } from '@/lib/portfolio-store';
import {
    formatCurrency, formatNumber, formatPercent, formatSignedCurrency, formatShare, formatDate,
} from '@/lib/format';
import TradeModal, { TradePreset } from '@/components/portfolio/TradeModal';
import { PageHeader, Panel, StatStrip, Signed, EmptyState, toneOf } from '@/components/ui/primitives';
import { ASSET_COLORS } from '@/components/ui/asset-colors';

function Notice({ children }: { children: React.ReactNode }) {
    return (
        <Group gap={8} wrap="nowrap" px="md" py={10} mb="md"
            style={{ border: '1px solid var(--wp-border)', borderLeft: '2px solid var(--wp-warn)', borderRadius: 6, background: 'var(--wp-surface)' }}>
            <IconAlertTriangle size={15} color="var(--wp-warn)" style={{ flex: 'none' }} />
            <Text size="sm" c="var(--wp-text-2)">{children}</Text>
        </Group>
    );
}

function AssetCell({ type, symbol, name }: { type: AssetType; symbol: string; name: string }) {
    const primary = type === 'gold' ? name : symbol;
    const secondary = type === 'gold' ? ASSET_TYPE_LABELS.gold : name;
    return (
        <Group gap={10} wrap="nowrap">
            <span className="wp-dot" style={{ background: ASSET_COLORS[type] }} />
            <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} lh={1.3}>{primary}</Text>
                <Text size="xs" c="var(--wp-text-3)" lh={1.3} truncate maw={220}>{secondary}</Text>
            </div>
        </Group>
    );
}

export default function PortfolioPage() {
    const { state, summary } = usePortfolio();
    const prices = usePriceStatus();
    const ready = useStoreReady();
    const [tradeOpened, tradeModal] = useDisclosure(false);
    const [preset, setPreset] = useState<TradePreset | undefined>();
    const [priceTarget, setPriceTarget] = useState<Holding | null>(null);
    const [manualPrice, setManualPrice] = useState<number | string>('');
    const [typeFilter, setTypeFilter] = useState<'all' | AssetType>('all');
    const fileRef = useRef<HTMLInputElement>(null);

    const presentTypes = useMemo(() => [...new Set(summary.holdings.map(h => h.type))], [summary.holdings]);
    const filter = typeFilter !== 'all' && !presentTypes.includes(typeFilter) ? 'all' : typeFilter;
    const holdings = filter === 'all' ? summary.holdings : summary.holdings.filter(h => h.type === filter);
    const trades = useMemo(() => sortTrades(state.trades).reverse(), [state.trades]);
    const missing = new Set(prices.missing);

    const filteredValue = holdings.reduce((s, h) => s + h.marketValue, 0);
    const filteredCost = holdings.reduce((s, h) => s + h.costBasis, 0);
    const filteredPnl = filteredValue - filteredCost;

    const openTrade = (p?: TradePreset) => {
        setPreset(p);
        tradeModal.open();
    };

    const deleteTrade = (id: string, label: string) => {
        modals.openConfirmModal({
            title: <Text fw={600}>İşlemi sil</Text>,
            children: <Text size="sm">{label} işlemi silinecek. Pozisyon ve kâr/zarar yeniden hesaplanır.</Text>,
            labels: { confirm: 'Sil', cancel: 'Vazgeç' },
            confirmProps: { color: 'red' },
            onConfirm: () => {
                const errors = portfolioActions.deleteTrade(id);
                if (errors.length) notifications.show({ title: 'Silinemedi', message: errors.join(' '), color: 'red' });
            },
        });
    };

    const importBackup = async (file: File) => {
        const text = await file.text();
        modals.openConfirmModal({
            title: <Text fw={600}>Yedekten geri yükle</Text>,
            children: <Text size="sm">Mevcut tüm işlemler ve fiyatlar yedekteki verilerle değiştirilecek.</Text>,
            labels: { confirm: 'Geri yükle', cancel: 'Vazgeç' },
            onConfirm: () => {
                const err = portfolioActions.importJson(text);
                notifications.show(err
                    ? { title: 'Geri yüklenemedi', message: err, color: 'red' }
                    : { title: 'Yedek yüklendi', message: 'Portföy yedekten geri yüklendi.', color: 'teal' });
            },
        });
    };

    const saveManualPrice = () => {
        if (!priceTarget || !(Number(manualPrice) > 0)) return;
        const currency = priceTarget.quote?.currency ?? priceTarget.currency;
        portfolioActions.setManualPrice(priceTarget.type, priceTarget.symbol, Number(manualPrice), currency);
        setPriceTarget(null);
    };

    const openCount = summary.holdings.length;

    return (
        <>
            <PageHeader
                title="Portföy"
                description={ready ? `${openCount} açık pozisyon · ${state.trades.length} işlem` : ' '}
                actions={
                    <>
                        <Menu position="bottom-end" width={220}>
                            <Menu.Target>
                                <ActionIcon variant="default" size="lg" aria-label="Yedekleme"><IconDots size={16} /></ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Label>Yedekleme</Menu.Label>
                                <Menu.Item leftSection={<IconDownload size={14} />} onClick={downloadBackup} disabled={state.trades.length === 0}>
                                    Yedeği indir (JSON)
                                </Menu.Item>
                                <Menu.Item leftSection={<IconUpload size={14} />} onClick={() => fileRef.current?.click()}>
                                    Yedekten geri yükle
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="application/json,.json"
                            hidden
                            data-testid="backup-input"
                            onChange={e => {
                                const f = e.currentTarget.files?.[0];
                                e.currentTarget.value = '';
                                if (f) void importBackup(f);
                            }}
                        />
                        <Button leftSection={<IconPlus size={15} />} onClick={() => openTrade()}>İşlem ekle</Button>
                    </>
                }
            />

            {prices.error && openCount > 0 && <Notice>{prices.error}</Notice>}
            {summary.unpricedCount > 0 && (
                <Notice>
                    {summary.unpricedCount} pozisyonun güncel fiyatı yok ve maliyet değeriyle hesaba katılıyor.
                    Satırdaki menüden fiyatı elle girebilirsiniz.
                </Notice>
            )}

            {!ready ? (
                <Skeleton h={78} radius={8} />
            ) : (
                <StatStrip
                    items={[
                        {
                            label: 'Piyasa değeri',
                            value: formatCurrency(summary.totalValue),
                            sub: summary.dayChangePct !== null && summary.dayChange !== 0
                                ? `Bugün ${formatSignedCurrency(summary.dayChange)} (${formatPercent(summary.dayChangePct)})`
                                : 'Bugün değişim yok',
                            subTone: toneOf(summary.dayChange),
                        },
                        { label: 'Maliyet', value: formatCurrency(summary.totalCost), sub: 'Açık pozisyonlar' },
                        {
                            label: 'Gerçekleşmemiş K/Z',
                            value: formatSignedCurrency(summary.unrealizedPnl),
                            tone: toneOf(summary.unrealizedPnl),
                            sub: summary.unrealizedPnlPct !== null ? formatPercent(summary.unrealizedPnlPct) : '—',
                            subTone: toneOf(summary.unrealizedPnl),
                        },
                        {
                            label: 'Gerçekleşen K/Z',
                            value: formatSignedCurrency(summary.realizedPnl),
                            tone: toneOf(summary.realizedPnl),
                            sub: summary.closed.length ? `${summary.closed.length} kapanan pozisyon dahil` : 'Satışlardan',
                        },
                    ]}
                />
            )}

            <Panel
                padded={false}
                style={{ marginTop: 16 }}
                title="Pozisyonlar"
                actions={presentTypes.length > 1 && (
                    <SegmentedControl
                        value={filter}
                        onChange={v => setTypeFilter(v as 'all' | AssetType)}
                        data={[{ value: 'all', label: 'Tümü' }, ...presentTypes.map(t => ({ value: t, label: ASSET_TYPE_LABELS[t] }))]}
                    />
                )}
            >
                {!ready ? (
                    <Skeleton h={220} m="md" />
                ) : summary.holdings.length === 0 ? (
                    <EmptyState
                        title="Henüz pozisyon yok"
                        description="İlk alışınızı ekleyin. Hisse, altın, döviz, fon ve kripto desteklenir; güncel değer ve kâr/zarar otomatik hesaplanır."
                        action={<Button leftSection={<IconPlus size={15} />} onClick={() => openTrade()}>İşlem ekle</Button>}
                    />
                ) : (
                    <div className="wp-table-scroll">
                        <table className="wp-table" data-testid="holdings-table">
                            <thead>
                                <tr>
                                    <th>Varlık</th>
                                    <th className="num">Miktar</th>
                                    <th className="num">Ort. maliyet</th>
                                    <th className="num">Son fiyat</th>
                                    <th className="num">Piyasa değeri</th>
                                    <th className="num">Kâr / zarar</th>
                                    <th className="num" style={{ width: 120 }}>Ağırlık</th>
                                    <th style={{ width: 44 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {holdings.map(h => (
                                    <tr key={h.key}>
                                        <td><AssetCell type={h.type} symbol={h.symbol} name={h.name} /></td>
                                        <td className="num">{formatNumber(h.quantity, 8)}</td>
                                        <td className="num">{formatCurrency(h.avgCost)}</td>
                                        <td className="num">
                                            {h.quote ? (
                                                <>
                                                    <div>{formatCurrency(h.quote.price, h.quote.currency)}</div>
                                                    <Text size="xs" lh={1.3} c={h.quote.source === 'manual' || missing.has(h.key) ? 'var(--wp-text-3)' : undefined}>
                                                        {h.quote.source === 'manual'
                                                            ? `elle · ${formatDate(h.quote.asOf)}`
                                                            : missing.has(h.key)
                                                                ? 'son bilinen'
                                                                : <Signed value={h.quote.changePercent}>{formatPercent(h.quote.changePercent)}</Signed>}
                                                    </Text>
                                                </>
                                            ) : (
                                                <Text size="xs" c="var(--wp-warn)">fiyat yok</Text>
                                            )}
                                        </td>
                                        <td className="num" style={{ fontWeight: 600 }}>{formatCurrency(h.marketValue)}</td>
                                        <td className="num">
                                            {h.quote ? (
                                                <>
                                                    <div><Signed value={h.unrealizedPnl}>{formatSignedCurrency(h.unrealizedPnl)}</Signed></div>
                                                    {h.unrealizedPnlPct !== null && (
                                                        <Text size="xs" lh={1.3}><Signed value={h.unrealizedPnl}>{formatPercent(h.unrealizedPnlPct)}</Signed></Text>
                                                    )}
                                                </>
                                            ) : <span className="wp-faint">—</span>}
                                        </td>
                                        <td className="num">
                                            <div>{formatShare(h.weight)}</div>
                                            <div className="wp-bar" style={{ marginTop: 4 }}>
                                                <span style={{ width: `${Math.min(100, h.weight)}%`, background: ASSET_COLORS[h.type] }} />
                                            </div>
                                        </td>
                                        <td>
                                            <Menu position="bottom-end" width={190}>
                                                <Menu.Target>
                                                    <ActionIcon size="sm" aria-label={`${h.symbol} işlemleri`}><IconDots size={15} /></ActionIcon>
                                                </Menu.Target>
                                                <Menu.Dropdown>
                                                    <Menu.Item onClick={() => openTrade({ side: 'buy', type: h.type, symbol: h.symbol, name: h.name, currency: h.currency })}>Alış ekle</Menu.Item>
                                                    <Menu.Item onClick={() => openTrade({ side: 'sell', type: h.type, symbol: h.symbol, name: h.name, currency: h.currency, price: h.quote?.price })}>Satış ekle</Menu.Item>
                                                    <Menu.Divider />
                                                    <Menu.Item onClick={() => { setPriceTarget(h); setManualPrice(h.quote?.price ?? ''); }}>Fiyatı elle gir</Menu.Item>
                                                </Menu.Dropdown>
                                            </Menu>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td>{filter === 'all' ? 'Toplam' : ASSET_TYPE_LABELS[filter]}</td>
                                    <td />
                                    <td className="num wp-muted" style={{ fontWeight: 400 }}>{formatCurrency(filteredCost)}</td>
                                    <td />
                                    <td className="num">{formatCurrency(filteredValue)}</td>
                                    <td className="num"><Signed value={filteredPnl}>{formatSignedCurrency(filteredPnl)}</Signed></td>
                                    <td className="num">{formatShare(summary.totalValue > 0 ? (filteredValue / summary.totalValue) * 100 : 0)}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </Panel>

            {ready && summary.closed.length > 0 && (
                <Panel padded={false} style={{ marginTop: 16 }} title="Kapanan pozisyonlar">
                    <div className="wp-table-scroll">
                        <table className="wp-table">
                            <thead>
                                <tr><th>Varlık</th><th className="num">Gerçekleşen K/Z</th></tr>
                            </thead>
                            <tbody>
                                {summary.closed.map(h => (
                                    <tr key={h.key}>
                                        <td><AssetCell type={h.type} symbol={h.symbol} name={h.name} /></td>
                                        <td className="num"><Signed value={h.realizedPnl}>{formatSignedCurrency(h.realizedPnl)}</Signed></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}

            {ready && trades.length > 0 && (
                <Panel padded={false} style={{ marginTop: 16 }} title="İşlem geçmişi">
                    <div className="wp-table-scroll">
                        <table className="wp-table" data-testid="trades-table">
                            <thead>
                                <tr>
                                    <th>Tarih</th>
                                    <th>Yön</th>
                                    <th>Varlık</th>
                                    <th className="num">Miktar</th>
                                    <th className="num">Fiyat</th>
                                    <th className="num">Komisyon</th>
                                    <th className="num">Tutar (₺)</th>
                                    <th style={{ width: 44 }} />
                                </tr>
                            </thead>
                            <tbody>
                                {trades.map(t => {
                                    const gross = t.quantity * t.price * t.fxRate;
                                    const fee = t.fee * t.fxRate;
                                    return (
                                        <tr key={t.id}>
                                            <td className="wp-muted">{formatDate(t.date)}</td>
                                            <td style={{ color: t.side === 'buy' ? 'var(--wp-pos)' : 'var(--wp-neg)', fontWeight: 500 }}>
                                                {t.side === 'buy' ? 'Alış' : 'Satış'}
                                            </td>
                                            <td><AssetCell type={t.type} symbol={t.symbol} name={t.name} /></td>
                                            <td className="num">{formatNumber(t.quantity, 8)}</td>
                                            <td className="num">{formatCurrency(t.price, t.currency)}</td>
                                            <td className="num wp-muted">{t.fee > 0 ? formatCurrency(t.fee, t.currency) : '—'}</td>
                                            <td className="num">{formatCurrency(t.side === 'buy' ? gross + fee : gross - fee)}</td>
                                            <td>
                                                <Tooltip label="İşlemi sil">
                                                    <ActionIcon size="sm" aria-label="İşlemi sil"
                                                        onClick={() => deleteTrade(t.id, `${formatDate(t.date)} tarihli ${t.symbol} ${t.side === 'buy' ? 'alışı' : 'satışı'}`)}>
                                                        <IconTrash size={14} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}

            {ready && openCount > 0 && (
                <Text size="xs" c="var(--wp-text-3)" mt="md">
                    Maliyet ağırlıklı ortalama yöntemiyle, işlem günü kuruyla TL bazında hesaplanır. Altın ve döviz pozisyonları
                    kuyumcu/banka alış fiyatıyla değerlenir.
                </Text>
            )}

            <TradeModal opened={tradeOpened} onClose={tradeModal.close} preset={preset} />

            <Modal opened={priceTarget !== null} onClose={() => setPriceTarget(null)} title={<Text fw={600}>Fiyatı elle gir</Text>} size="sm">
                {priceTarget && (
                    <Stack gap="sm">
                        <Text size="sm" c="var(--wp-text-2)">{priceTarget.name} · {priceTarget.symbol}</Text>
                        <NumberInput
                            label={`Birim fiyat (${priceTarget.quote?.currency ?? priceTarget.currency})`}
                            value={manualPrice}
                            onChange={setManualPrice}
                            min={0}
                            decimalScale={8}
                            thousandSeparator="."
                            decimalSeparator=","
                            hideControls
                            data-autofocus
                        />
                        <Text size="xs" c="var(--wp-text-3)">Canlı fiyat geldiğinde elle girilen fiyatın yerini alır.</Text>
                        <Group justify="flex-end" gap="xs">
                            <Button variant="default" onClick={() => setPriceTarget(null)}>Vazgeç</Button>
                            <Button onClick={saveManualPrice} disabled={!(Number(manualPrice) > 0)}>Kaydet</Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </>
    );
}
