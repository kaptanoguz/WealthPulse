'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, Group, TextInput, SegmentedControl, Button, Skeleton, Stack, Tooltip, ActionIcon } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconSearch, IconRefresh, IconPlus, IconArrowsSort, IconSortAscending, IconSortDescending } from '@tabler/icons-react';
import { AssetType, Currency, holdingKey } from '@/lib/portfolio';
import { usePortfolio } from '@/lib/portfolio-store';
import { formatCurrency, formatPercent, formatSignedCurrency, formatTimestamp } from '@/lib/format';
import { PageHeader, Panel, Signed, EmptyState } from '@/components/ui/primitives';
import TradeModal, { TradePreset } from '@/components/portfolio/TradeModal';

interface MarketRow {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    type: AssetType;
    market?: string;
    currency?: string;
}

interface GoldRow {
    key: string;
    name: string;
    buying: number;
    selling: number;
    changePercent: number;
}

type Segment = 'all' | 'bist' | 'us' | 'fund' | 'forex' | 'crypto' | 'gold';
type SortKey = 'name' | 'price' | 'changePercent';

const SEGMENTS: { value: Segment; label: string }[] = [
    { value: 'all', label: 'Tümü' },
    { value: 'bist', label: 'BIST' },
    { value: 'us', label: 'ABD' },
    { value: 'fund', label: 'Fon' },
    { value: 'forex', label: 'Döviz' },
    { value: 'crypto', label: 'Kripto' },
    { value: 'gold', label: 'Altın' },
];

function segmentOf(r: MarketRow): Exclude<Segment, 'all' | 'gold'> {
    if (r.type === 'fund') return 'fund';
    if (r.type === 'forex') return 'forex';
    if (r.type === 'crypto') return 'crypto';
    if (r.type === 'etf') return 'us';
    return r.market === 'BIST' || r.currency === 'TRY' ? 'bist' : 'us';
}

const SECTION_TITLES: Record<Exclude<Segment, 'all' | 'gold'>, string> = {
    bist: 'Borsa İstanbul',
    us: 'ABD hisseleri ve ETF',
    fund: 'Fonlar',
    forex: 'Döviz',
    crypto: 'Kripto',
};

/** Maps a market row to the symbol/currency the portfolio uses for it. */
function toPreset(r: MarketRow): TradePreset {
    const currency: Currency = r.currency === 'USD' || r.currency === 'EUR' ? r.currency : 'TRY';
    if (r.type === 'forex') return { side: 'buy', type: 'forex', symbol: r.symbol.split('/')[0], name: r.name, currency: 'TRY', price: r.price };
    if (r.type === 'crypto') return { side: 'buy', type: 'crypto', symbol: r.symbol.split('/')[0], name: r.name, currency: 'USD', price: r.price };
    return { side: 'buy', type: r.type, symbol: r.symbol, name: r.name, currency, price: r.price };
}

function SortHeader({ label, k, sort, onSort, align = 'right' }: {
    label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 } | null; onSort: (k: SortKey) => void; align?: 'left' | 'right';
}) {
    const active = sort?.key === k;
    const Icon = !active ? IconArrowsSort : sort.dir === 1 ? IconSortAscending : IconSortDescending;
    return (
        <th className={align === 'right' ? 'num' : undefined} style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort(k)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: active ? 'var(--wp-text)' : undefined }}>
                {label}
                <Icon size={12} style={{ opacity: active ? 1 : 0.5 }} />
            </span>
        </th>
    );
}

export default function MarketsPage() {
    const { summary } = usePortfolio();
    const [rows, setRows] = useState<MarketRow[]>([]);
    const [gold, setGold] = useState<GoldRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [updatedAt, setUpdatedAt] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [segment, setSegment] = useState<Segment>('all');
    const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
    const [tradeOpened, tradeModal] = useDisclosure(false);
    const [preset, setPreset] = useState<TradePreset | undefined>();

    const held = useMemo(() => new Set(summary.holdings.map(h => h.key)), [summary.holdings]);

    const load = useCallback(async () => {
        setLoading(true);
        const [m, g] = await Promise.allSettled([
            fetch('/api/markets').then(r => (r.ok ? r.json() : null)),
            fetch('/api/gold').then(r => (r.ok ? r.json() : null)),
        ]);
        const marketData: MarketRow[] = m.status === 'fulfilled' && Array.isArray(m.value?.data) ? m.value.data : [];
        const goldData: GoldRow[] = g.status === 'fulfilled' && Array.isArray(g.value?.data) ? g.value.data : [];
        setRows(marketData);
        setGold(goldData);
        setFailed(marketData.length === 0 && goldData.length === 0);
        setUpdatedAt(marketData.length || goldData.length ? new Date().toISOString() : null);
        setLoading(false);
    }, []);

    useEffect(() => {
        // Fetch on mount and every 2 minutes; state updates happen after the awaits.
        const first = setTimeout(() => void load(), 0);
        const id = setInterval(() => void load(), 120_000);
        return () => { clearTimeout(first); clearInterval(id); };
    }, [load]);

    const q = search.trim().toLocaleLowerCase('tr-TR');
    const match = (s: string) => !q || s.toLocaleLowerCase('tr-TR').includes(q);

    const sections = useMemo(() => {
        const out = new Map<Exclude<Segment, 'all' | 'gold'>, MarketRow[]>();
        for (const r of rows) {
            if (!match(r.symbol) && !match(r.name)) continue;
            const seg = segmentOf(r);
            if (segment !== 'all' && segment !== seg) continue;
            if (!out.has(seg)) out.set(seg, []);
            out.get(seg)!.push(r);
        }
        if (sort) {
            for (const list of out.values()) {
                list.sort((a, b) => sort.key === 'name' ? a.symbol.localeCompare(b.symbol, 'tr') * sort.dir : (a[sort.key] - b[sort.key]) * sort.dir);
            }
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, q, segment, sort]);

    const goldRows = segment === 'all' || segment === 'gold' ? gold.filter(g => match(g.name)) : [];
    const onSort = (k: SortKey) => setSort(s => (s?.key === k ? (s.dir === -1 ? { key: k, dir: 1 } : null) : { key: k, dir: -1 }));
    const openTrade = (p: TradePreset) => { setPreset(p); tradeModal.open(); };
    const nothing = !loading && !failed && sections.size === 0 && goldRows.length === 0;

    return (
        <>
            <PageHeader
                title="Piyasalar"
                description={updatedAt ? `Son güncelleme ${formatTimestamp(updatedAt)} · Yahoo Finance, Kuyumcular Odası, CoinGecko` : 'Yahoo Finance, Kuyumcular Odası, CoinGecko'}
                actions={
                    <Tooltip label="Yenile">
                        <ActionIcon variant="default" size="lg" onClick={() => void load()} loading={loading} aria-label="Yenile">
                            <IconRefresh size={16} />
                        </ActionIcon>
                    </Tooltip>
                }
            />

            <Group gap="sm" mb="md" wrap="wrap">
                <TextInput
                    placeholder="Sembol veya ad ara"
                    leftSection={<IconSearch size={15} />}
                    value={search}
                    onChange={e => setSearch(e.currentTarget.value)}
                    style={{ flex: 1, minWidth: 220, maxWidth: 360 }}
                />
                <SegmentedControl size="sm" value={segment} onChange={v => setSegment(v as Segment)} data={SEGMENTS} />
            </Group>

            {loading && rows.length === 0 && gold.length === 0 ? (
                <Stack gap={16}>
                    <Skeleton h={260} radius={8} />
                    <Skeleton h={200} radius={8} />
                </Stack>
            ) : failed ? (
                <Panel>
                    <EmptyState
                        title="Piyasa verisine ulaşılamadı"
                        description="Veri kaynakları şu an yanıt vermiyor ya da internet bağlantısı yok. Portföyünüz son bilinen fiyatlarla çalışmaya devam eder."
                        action={<Button variant="default" leftSection={<IconRefresh size={15} />} onClick={() => void load()}>Tekrar dene</Button>}
                    />
                </Panel>
            ) : nothing ? (
                <Panel><EmptyState title="Sonuç yok" description="Aramanızla eşleşen enstrüman bulunamadı." /></Panel>
            ) : (
                <Stack gap={16}>
                    {[...sections.entries()].map(([seg, list]) => (
                        <Panel key={seg} padded={false} title={<>{SECTION_TITLES[seg]} <Text span c="var(--wp-text-3)" fw={400}>· {list.length}</Text></>}>
                            <div className="wp-table-scroll">
                                <table className="wp-table">
                                    <thead>
                                        <tr>
                                            <SortHeader label="Enstrüman" k="name" sort={sort} onSort={onSort} align="left" />
                                            <SortHeader label="Son" k="price" sort={sort} onSort={onSort} />
                                            <th className="num">Değişim</th>
                                            <SortHeader label="Değişim %" k="changePercent" sort={sort} onSort={onSort} />
                                            <th style={{ width: 120 }} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {list.map(r => {
                                            const p = toPreset(r);
                                            const inPortfolio = p.type && p.symbol ? held.has(holdingKey(p.type, p.symbol)) : false;
                                            const cur = r.currency && r.currency !== 'TRY' ? r.currency : 'TRY';
                                            return (
                                                <tr key={`${r.type}-${r.symbol}`}>
                                                    <td>
                                                        <Group gap={8} wrap="nowrap">
                                                            <div style={{ minWidth: 0 }}>
                                                                <Text size="sm" fw={600} lh={1.3}>{r.symbol}</Text>
                                                                <Text size="xs" c="var(--wp-text-3)" lh={1.3} truncate maw={260}>{r.name}</Text>
                                                            </div>
                                                            {inPortfolio && <Text size="xs" c="var(--wp-accent)" style={{ whiteSpace: 'nowrap' }}>Portföyde</Text>}
                                                        </Group>
                                                    </td>
                                                    <td className="num" style={{ fontWeight: 600 }}>{formatCurrency(r.price, cur)}</td>
                                                    <td className="num"><Signed value={r.change}>{formatSignedCurrency(r.change, cur)}</Signed></td>
                                                    <td className="num"><Signed value={r.changePercent}>{formatPercent(r.changePercent)}</Signed></td>
                                                    <td className="num">
                                                        <Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={12} />} onClick={() => openTrade(p)}>
                                                            İşlem
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>
                    ))}

                    {goldRows.length > 0 && (
                        <Panel padded={false} title={<>Altın <Text span c="var(--wp-text-3)" fw={400}>· Kuyumcular Odası</Text></>}>
                            <div className="wp-table-scroll">
                                <table className="wp-table">
                                    <thead>
                                        <tr>
                                            <th>Tür</th>
                                            <th className="num">Alış</th>
                                            <th className="num">Satış</th>
                                            <th className="num">Makas</th>
                                            <th className="num">Değişim %</th>
                                            <th style={{ width: 120 }} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {goldRows.map(g => {
                                            const cur = g.key === 'ons' ? 'USD' : 'TRY';
                                            const spread = g.buying > 0 ? ((g.selling - g.buying) / g.buying) * 100 : 0;
                                            return (
                                                <tr key={g.key}>
                                                    <td>
                                                        <Group gap={8} wrap="nowrap">
                                                            <Text size="sm" fw={600}>{g.name}</Text>
                                                            {held.has(holdingKey('gold', g.key)) && <Text size="xs" c="var(--wp-accent)">Portföyde</Text>}
                                                        </Group>
                                                    </td>
                                                    <td className="num">{formatCurrency(g.buying, cur)}</td>
                                                    <td className="num" style={{ fontWeight: 600 }}>{formatCurrency(g.selling, cur)}</td>
                                                    <td className="num wp-muted">{formatPercent(spread).replace('+', '')}</td>
                                                    <td className="num"><Signed value={g.changePercent}>{formatPercent(g.changePercent)}</Signed></td>
                                                    <td className="num">
                                                        <Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={12} />}
                                                            onClick={() => openTrade({ side: 'buy', type: 'gold', symbol: g.key, name: g.name, currency: cur, price: g.selling })}>
                                                            İşlem
                                                        </Button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>
                    )}
                </Stack>
            )}

            <TradeModal opened={tradeOpened} onClose={tradeModal.close} preset={preset} />
        </>
    );
}
