'use client';

import Link from 'next/link';
import { SimpleGrid, Text, Group, Stack, Paper, Button, Table, Badge, Skeleton } from '@mantine/core';
import {
    IconWallet, IconTrendingUp, IconTrendingDown, IconCoins, IconChartPie, IconCpu, IconPlus,
} from '@tabler/icons-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { allocationByType } from '@/lib/portfolio';
import { usePortfolio, usePriceRefresh, useStoreReady } from '@/lib/portfolio-store';
import { formatCurrency, formatPercent, formatCompactTRY } from '@/lib/format';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const tooltipStyle = { background: '#1a2035', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 };

export default function DashboardPage() {
    const { state, summary } = usePortfolio();
    usePriceRefresh();
    const allocation = allocationByType(summary.holdings);
    const history = state.snapshots;
    const ready = useStoreReady();

    if (!ready) {
        return (
            <Stack gap="lg">
                <Text size="xl" fw={800}>Özet</Text>
                <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="md">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={110} radius="md" />)}
                </SimpleGrid>
                <Skeleton h={320} radius="md" />
            </Stack>
        );
    }

    if (state.trades.length === 0) {
        return (
            <Stack gap="lg">
                <Text size="xl" fw={800}>Özet</Text>
                <Paper p="xl" radius="md" style={{ background: 'var(--wp-bg-card)', border: '1px solid var(--wp-border)' }}>
                    <Stack align="center" gap="sm" py="lg">
                        <IconWallet size={36} color="#3b82f6" />
                        <Text fw={700} size="lg">Portföyünüzü oluşturarak başlayın</Text>
                        <Text c="dimmed" size="sm" ta="center" maw={520}>
                            Hisse, altın, döviz, fon ve kripto alışlarınızı girin; güncel değer, kâr/zarar ve dağılım otomatik hesaplansın.
                            Ardından Monte Carlo simülasyonuyla portföyünüzün olası geleceğini görün.
                        </Text>
                        <Button component={Link} href="/portfolio" leftSection={<IconPlus size={16} />} mt="sm">Portföye git</Button>
                    </Stack>
                </Paper>
            </Stack>
        );
    }

    const kpis = [
        {
            label: 'Toplam değer',
            value: formatCurrency(summary.totalValue),
            sub: summary.dayChangePct !== null && summary.dayChange !== 0 ? `Bugün ${formatPercent(summary.dayChangePct)}` : undefined,
            positive: summary.dayChange >= 0,
            icon: IconWallet,
            color: '#3b82f6',
        },
        {
            label: 'Gerçekleşmemiş K/Z',
            value: formatCurrency(summary.unrealizedPnl),
            sub: summary.unrealizedPnlPct !== null ? formatPercent(summary.unrealizedPnlPct) : undefined,
            positive: summary.unrealizedPnl >= 0,
            icon: summary.unrealizedPnl >= 0 ? IconTrendingUp : IconTrendingDown,
            color: summary.unrealizedPnl >= 0 ? '#22c55e' : '#ef4444',
        },
        {
            label: 'Gerçekleşen K/Z',
            value: formatCurrency(summary.realizedPnl),
            positive: summary.realizedPnl >= 0,
            icon: IconCoins,
            color: '#f59e0b',
        },
        {
            label: 'Varlık sayısı',
            value: String(summary.holdings.length),
            sub: allocation[0] ? `En büyük: ${allocation[0].name} %${allocation[0].weight.toFixed(0)}` : undefined,
            positive: true,
            icon: IconChartPie,
            color: '#8b5cf6',
        },
    ];

    return (
        <Stack gap="lg">
            <Group justify="space-between">
                <Text size="xl" fw={800}>Özet</Text>
                <Button component={Link} href="/simulator" variant="light" leftSection={<IconCpu size={16} />} size="sm">
                    Bu portföyü simüle et
                </Button>
            </Group>

            <SimpleGrid cols={{ base: 2, lg: 4 }} spacing="md">
                {kpis.map(kpi => (
                    <div className="kpi-card" key={kpi.label}>
                        <Group gap={6} mb={6}>
                            <kpi.icon size={16} color={kpi.color} />
                            <div className="kpi-label">{kpi.label}</div>
                        </Group>
                        <div className="kpi-value" style={{ fontSize: 22 }}>{kpi.value}</div>
                        {kpi.sub && <div className={`kpi-change ${kpi.positive ? 'positive' : 'negative'}`}>{kpi.sub}</div>}
                    </div>
                ))}
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <div className="chart-card">
                    <h3>📈 Portföy değeri ve maliyet</h3>
                    {history.length < 2 ? (
                        <Text c="dimmed" size="sm" py="xl" ta="center">
                            Geçmiş grafik, uygulamayı farklı günlerde açtıkça oluşur (günde bir kayıt).
                        </Text>
                    ) : (
                        <ResponsiveContainer width="100%" height={280}>
                            <LineChart data={history}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickFormatter={v => String(v).slice(5)} />
                                <YAxis stroke="#64748b" fontSize={11} tickFormatter={formatCompactTRY} width={70} />
                                <Tooltip
                                    contentStyle={tooltipStyle}
                                    formatter={(v?: number | string, name?: string) => [formatCurrency(Number(v ?? 0)), name === 'value' ? 'Değer' : 'Maliyet']}
                                />
                                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                                <Line type="stepAfter" dataKey="cost" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

                <div className="chart-card">
                    <h3>🍩 Varlık dağılımı</h3>
                    <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                            <Pie data={allocation} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" nameKey="name">
                                {allocation.map((a, i) => <Cell key={a.type} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} formatter={(v?: number | string) => [formatCurrency(Number(v ?? 0)), 'Tutar']} />
                            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </SimpleGrid>

            <Paper p="lg" radius="md" style={{ background: 'var(--wp-bg-card)', border: '1px solid var(--wp-border)' }}>
                <Group justify="space-between" mb="md">
                    <Text fw={600} c="dimmed" size="sm">En büyük pozisyonlar</Text>
                    <Button component={Link} href="/portfolio" variant="subtle" size="compact-sm">Tümü</Button>
                </Group>
                <Table.ScrollContainer minWidth={520}>
                    <Table styles={{ td: { fontSize: 13, padding: '8px 12px', borderBottom: '1px solid var(--wp-border)' } }}>
                        <Table.Tbody>
                            {summary.holdings.slice(0, 5).map(h => (
                                <Table.Tr key={h.key}>
                                    <Table.Td fw={600}>{h.type === 'gold' ? h.name : h.symbol}</Table.Td>
                                    <Table.Td><Badge size="xs" variant="light">%{h.weight.toFixed(1)}</Badge></Table.Td>
                                    <Table.Td style={{ textAlign: 'right' }}>{formatCurrency(h.marketValue)}</Table.Td>
                                    <Table.Td style={{ textAlign: 'right' }}>
                                        {h.unrealizedPnlPct !== null && h.quote
                                            ? <Text size="sm" fw={600} c={h.unrealizedPnl >= 0 ? 'green' : 'red'}>{formatPercent(h.unrealizedPnlPct)}</Text>
                                            : <Text size="xs" c="dimmed">fiyat yok</Text>}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Paper>
        </Stack>
    );
}
