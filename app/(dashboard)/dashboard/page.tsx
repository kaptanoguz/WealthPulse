'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { SimpleGrid, Text, Group, Button, SegmentedControl, Skeleton, Stack } from '@mantine/core';
import { IconArrowRight, IconPlus } from '@tabler/icons-react';
import {
    AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { allocationByType, ASSET_TYPE_LABELS } from '@/lib/portfolio';
import { usePortfolio, useStoreReady } from '@/lib/portfolio-store';
import {
    formatCurrency, formatPercent, formatCompactTRY, formatSignedCurrency, formatShare, formatDate,
} from '@/lib/format';
import { PageHeader, Panel, StatStrip, Signed, EmptyState, ChartTooltip, axisProps, toneOf } from '@/components/ui/primitives';
import { ASSET_COLORS } from '@/components/ui/asset-colors';

const RANGES = [
    { value: '30', label: '1A' },
    { value: '90', label: '3A' },
    { value: '365', label: '1Y' },
    { value: 'all', label: 'Tümü' },
];

export default function DashboardPage() {
    const { state, summary } = usePortfolio();
    const ready = useStoreReady();
    const [range, setRange] = useState('90');
    const allocation = useMemo(() => allocationByType(summary.holdings), [summary.holdings]);

    const history = useMemo(() => {
        if (range === 'all') return state.snapshots;
        const from = new Date();
        from.setDate(from.getDate() - Number(range));
        const iso = from.toISOString().slice(0, 10);
        return state.snapshots.filter(s => s.date >= iso);
    }, [state.snapshots, range]);

    const movers = useMemo(
        () => summary.holdings.filter(h => h.quote && h.dayChange !== 0).sort((a, b) => Math.abs(b.dayChange) - Math.abs(a.dayChange)).slice(0, 5),
        [summary.holdings],
    );

    if (!ready) {
        return (
            <>
                <PageHeader title="Özet" />
                <Skeleton h={78} radius={8} />
                <Skeleton h={320} radius={8} mt={16} />
            </>
        );
    }

    if (state.trades.length === 0) {
        return (
            <>
                <PageHeader title="Özet" />
                <Panel>
                    <EmptyState
                        title="Portföyünüzü oluşturun"
                        description="Alışlarınızı girin; piyasa değeri, kâr/zarar ve varlık dağılımı canlı fiyatlarla hesaplansın. Ardından Monte Carlo simülasyonuyla portföyün olası geleceğini inceleyin."
                        action={<Button component={Link} href="/portfolio" leftSection={<IconPlus size={15} />}>İlk işlemi ekle</Button>}
                    />
                </Panel>
            </>
        );
    }

    const first = history[0];
    const last = history[history.length - 1];
    const periodChange = first && last ? last.value - last.cost - (first.value - first.cost) : 0;

    return (
        <>
            <PageHeader
                title="Özet"
                description={`${summary.holdings.length} açık pozisyon`}
                actions={
                    <Button component={Link} href="/simulator" variant="default" rightSection={<IconArrowRight size={14} />}>
                        Simülasyona git
                    </Button>
                }
            />

            <StatStrip
                items={[
                    { label: 'Piyasa değeri', value: formatCurrency(summary.totalValue), sub: `Maliyet ${formatCurrency(summary.totalCost)}` },
                    {
                        label: 'Bugün',
                        value: formatSignedCurrency(summary.dayChange),
                        tone: toneOf(summary.dayChange),
                        sub: summary.dayChangePct !== null ? formatPercent(summary.dayChangePct) : '—',
                        subTone: toneOf(summary.dayChange),
                    },
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
                        sub: 'Satışlardan',
                    },
                ]}
            />

            <SimpleGrid cols={{ base: 1, lg: 3 }} spacing={16} mt={16}>
                <Panel
                    className="wp-span-2"
                    title="Değer geçmişi"
                    actions={<SegmentedControl value={range} onChange={setRange} data={RANGES} />}
                >
                    {history.length < 2 ? (
                        <Stack h={260} justify="center" align="center" gap={4}>
                            <Text size="sm" c="var(--wp-text-2)">Henüz yeterli geçmiş yok</Text>
                            <Text size="xs" c="var(--wp-text-3)" ta="center" maw={360}>
                                Uygulama her gün portföy değerinin bir kaydını tutar; grafik ikinci günden itibaren oluşur.
                            </Text>
                        </Stack>
                    ) : (
                        <>
                            <Group gap="lg" mb="sm">
                                <Group gap={6}><span className="wp-dot" style={{ background: 'var(--wp-c1)' }} /><Text size="xs" c="var(--wp-text-2)">Piyasa değeri</Text></Group>
                                <Group gap={6}><span className="wp-dot" style={{ background: 'var(--wp-text-3)' }} /><Text size="xs" c="var(--wp-text-2)">Maliyet</Text></Group>
                                <Text size="xs" c="var(--wp-text-3)" ml="auto">
                                    Dönem K/Z değişimi <Signed value={periodChange}>{formatSignedCurrency(periodChange)}</Signed>
                                </Text>
                            </Group>
                            <ResponsiveContainer width="100%" height={240} initialDimension={{ width: 600, height: 240 }}>
                                <AreaChart data={history} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--wp-c1)" stopOpacity={0.18} />
                                            <stop offset="100%" stopColor="var(--wp-c1)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} stroke="var(--wp-grid)" />
                                    <XAxis dataKey="date" {...axisProps} tickFormatter={v => formatDate(String(v)).slice(0, 5)} minTickGap={32} />
                                    <YAxis {...axisProps} tickFormatter={formatCompactTRY} width={64} domain={['auto', 'auto']} />
                                    <Tooltip
                                        cursor={{ stroke: 'var(--wp-border-strong)' }}
                                        content={<ChartTooltip
                                            title={l => formatDate(String(l))}
                                            rows={e => ({ label: e.dataKey === 'value' ? 'Piyasa değeri' : 'Maliyet', value: formatCurrency(Number(e.value)), color: e.dataKey === 'value' ? 'var(--wp-c1)' : 'var(--wp-text-3)' })}
                                        />}
                                    />
                                    <Area type="monotone" dataKey="value" stroke="var(--wp-c1)" strokeWidth={1.75} fill="url(#valueFill)" isAnimationActive={false} />
                                    <Line type="stepAfter" dataKey="cost" stroke="var(--wp-text-3)" strokeWidth={1} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </>
                    )}
                </Panel>

                <Panel title="Dağılım" padded={false}>
                    <div style={{ height: 150, padding: '12px 0 0' }}>
                        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 240, height: 150 }}>
                            <PieChart>
                                <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={44} outerRadius={64} paddingAngle={1.5} stroke="none" isAnimationActive={false}>
                                    {allocation.map(a => <Cell key={a.type} fill={ASSET_COLORS[a.type]} />)}
                                </Pie>
                                <Tooltip content={<ChartTooltip title={() => 'Dağılım'} rows={e => ({ label: String(e.name), value: formatCurrency(Number(e.value)) })} />} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <table className="wp-table">
                        <tbody>
                            {allocation.map(a => (
                                <tr key={a.type}>
                                    <td>
                                        <Group gap={8} wrap="nowrap">
                                            <span className="wp-dot" style={{ background: ASSET_COLORS[a.type] }} />
                                            {ASSET_TYPE_LABELS[a.type]}
                                        </Group>
                                    </td>
                                    <td className="num wp-muted">{formatCurrency(a.value)}</td>
                                    <td className="num" style={{ fontWeight: 600, width: 64 }}>{formatShare(a.weight)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing={16} mt={16}>
                <Panel title="En büyük pozisyonlar" padded={false}
                    actions={<Button component={Link} href="/portfolio" variant="subtle" size="compact-xs">Tümü</Button>}>
                    <div className="wp-table-scroll">
                    <table className="wp-table">
                        <thead>
                            <tr><th>Varlık</th><th className="num">Değer</th><th className="num">K/Z</th><th className="num">Ağırlık</th></tr>
                        </thead>
                        <tbody>
                            {summary.holdings.slice(0, 6).map(h => (
                                <tr key={h.key}>
                                    <td>
                                        <Group gap={8} wrap="nowrap">
                                            <span className="wp-dot" style={{ background: ASSET_COLORS[h.type] }} />
                                            <Text size="sm" fw={500}>{h.type === 'gold' ? h.name : h.symbol}</Text>
                                        </Group>
                                    </td>
                                    <td className="num">{formatCurrency(h.marketValue)}</td>
                                    <td className="num">
                                        {h.quote && h.unrealizedPnlPct !== null
                                            ? <Signed value={h.unrealizedPnl}>{formatPercent(h.unrealizedPnlPct)}</Signed>
                                            : <span className="wp-faint">—</span>}
                                    </td>
                                    <td className="num">{formatShare(h.weight)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </Panel>

                <Panel title="Günün hareketleri" padded={false}>
                    {movers.length === 0 ? (
                        <Text size="sm" c="var(--wp-text-3)" p="md">Bugün için fiyat değişimi verisi yok.</Text>
                    ) : (
                        <div className="wp-table-scroll">
                        <table className="wp-table">
                            <thead>
                                <tr><th>Varlık</th><th className="num">Değişim</th><th className="num">Etki (₺)</th></tr>
                            </thead>
                            <tbody>
                                {movers.map(h => (
                                    <tr key={h.key}>
                                        <td>
                                            <Group gap={8} wrap="nowrap">
                                                <span className="wp-dot" style={{ background: ASSET_COLORS[h.type] }} />
                                                <Text size="sm" fw={500}>{h.type === 'gold' ? h.name : h.symbol}</Text>
                                            </Group>
                                        </td>
                                        <td className="num"><Signed value={h.quote!.changePercent}>{formatPercent(h.quote!.changePercent)}</Signed></td>
                                        <td className="num"><Signed value={h.dayChange}>{formatSignedCurrency(h.dayChange)}</Signed></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    )}
                </Panel>
            </SimpleGrid>
        </>
    );
}
