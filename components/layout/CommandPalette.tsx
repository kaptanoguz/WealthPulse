'use client';

// ============================================================
// WealthPulse — ⌘K command palette
// ============================================================
//
// Pages, holdings and commands in one searchable list. Typing a trade
// shorthand such as "al THYAO 10" or "sat btc" offers a prefilled trade form.

import { useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Group, Kbd, Text, UnstyledButton, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { Spotlight, spotlight } from '@mantine/spotlight';
import {
    IconSearch, IconLayoutDashboard, IconBriefcase2, IconChartArea, IconChartCandle, IconSettings,
    IconPlus, IconMinus, IconRefresh, IconSunMoon, IconDownload, IconArrowRight,
} from '@tabler/icons-react';
import { ASSET_TYPE_LABELS, AssetType, Currency, Holding } from '@/lib/portfolio';
import { downloadBackup, refreshPrices, usePortfolio } from '@/lib/portfolio-store';
import { formatCurrency, formatNumber, formatShare } from '@/lib/format';
import { openTrade } from '@/components/portfolio/TradeModal';
import { ASSET_COLORS } from '@/components/ui/asset-colors';

interface PaletteAction {
    id: string;
    group: string;
    label: string;
    description?: string;
    keywords?: string;
    icon?: React.ReactNode;
    right?: React.ReactNode;
    run: () => void;
}

const PAGES = [
    { label: 'Özet', path: '/dashboard', icon: IconLayoutDashboard, keywords: 'dashboard ana sayfa' },
    { label: 'Portföy', path: '/portfolio', icon: IconBriefcase2, keywords: 'pozisyon varlık işlem geçmişi' },
    { label: 'Simülasyon', path: '/simulator', icon: IconChartArea, keywords: 'monte carlo senaryo tahmin' },
    { label: 'Piyasalar', path: '/markets', icon: IconChartCandle, keywords: 'borsa fiyat kur altın kripto' },
    { label: 'Ayarlar', path: '/settings', icon: IconSettings, keywords: 'tema yedek veri' },
];

const norm = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

/** Every whitespace-separated term must appear somewhere in the haystack. */
function matches(query: string, ...fields: (string | undefined)[]): boolean {
    const terms = norm(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const hay = norm(fields.filter(Boolean).join(' '));
    return terms.every(t => hay.includes(t));
}

/** "al THYAO 10", "sat btc 0,5", "buy aapl" → parsed trade shorthand. */
export function parseTradeShorthand(query: string): { side: 'buy' | 'sell'; symbol: string; quantity?: number } | null {
    const m = query.trim().match(/^(al|alış|alis|buy|sat|satış|satis|sell)\s+([\p{L}\p{N}.\-/=]+)(?:\s+([\d.,]+))?$/iu);
    if (!m) return null;
    const side = /^(al|alış|alis|buy)$/i.test(m[1]) ? 'buy' : 'sell';
    const qty = m[3] ? Number(m[3].replace(/\./g, '').replace(',', '.')) : undefined;
    return { side, symbol: m[2].toUpperCase(), quantity: qty && qty > 0 ? qty : undefined };
}

function holdingLabel(h: Holding) {
    return h.type === 'gold' ? h.name : h.symbol;
}

const noopSubscribe = () => () => {};

/** "⌘K" on macOS, "Ctrl K" elsewhere (the Electron build targets Windows and Linux). */
function useShortcutLabel(): string {
    return useSyncExternalStore(
        noopSubscribe,
        () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'),
        () => '⌘K',
    );
}

export function CommandPaletteTrigger() {
    const shortcut = useShortcutLabel();
    return (
        <UnstyledButton
            onClick={() => spotlight.open()}
            aria-label="Ara veya komut çalıştır"
            className="wp-search-trigger"
        >
            <IconSearch size={14} />
            <Text size="sm" c="var(--wp-text-3)" style={{ flex: 1 }} visibleFrom="sm">Ara veya komut…</Text>
            <Kbd size="xs" visibleFrom="sm">{shortcut}</Kbd>
        </UnstyledButton>
    );
}

export default function CommandPalette() {
    const router = useRouter();
    const { summary } = usePortfolio();
    const { setColorScheme } = useMantineColorScheme();
    const computed = useComputedColorScheme('dark', { getInitialValueInEffect: true });
    const [query, setQuery] = useState('');

    const actions = useMemo<PaletteAction[]>(() => {
        const list: PaletteAction[] = [];

        // Trade shorthand goes first so Enter runs it straight away.
        const trade = parseTradeShorthand(query);
        if (trade) {
            const held = summary.holdings.find(h => h.symbol === trade.symbol || norm(h.name) === norm(trade.symbol));
            const type: AssetType = held?.type ?? 'stock';
            const currency: Currency = held?.currency ?? 'TRY';
            const label = held ? holdingLabel(held) : trade.symbol;
            list.push({
                id: 'trade-shorthand',
                group: 'İşlem',
                label: `${label} ${trade.side === 'buy' ? 'alışı' : 'satışı'}${trade.quantity ? ` · ${formatNumber(trade.quantity, 8)} adet` : ''}`,
                description: held
                    ? `${ASSET_TYPE_LABELS[held.type]} · eldeki ${formatNumber(held.quantity, 8)}`
                    : 'Portföyde yok; hisse senedi olarak açılır, formda değiştirebilirsiniz',
                icon: trade.side === 'buy' ? <IconPlus size={16} /> : <IconMinus size={16} />,
                right: <Kbd size="xs">↵</Kbd>,
                run: () => openTrade({
                    side: trade.side,
                    type,
                    symbol: held?.symbol ?? trade.symbol,
                    name: held?.name ?? '',
                    currency,
                    quantity: trade.quantity,
                    price: held?.quote?.price,
                }),
            });
        }

        for (const p of PAGES) {
            list.push({
                id: `page-${p.path}`,
                group: 'Sayfalar',
                label: p.label,
                keywords: p.keywords,
                icon: <p.icon size={16} stroke={1.75} />,
                right: <IconArrowRight size={14} color="var(--wp-text-3)" />,
                run: () => router.push(p.path),
            });
        }

        for (const h of summary.holdings) {
            list.push({
                id: `holding-${h.key}`,
                group: 'Pozisyonlar',
                label: holdingLabel(h),
                description: `${h.type === 'gold' ? ASSET_TYPE_LABELS.gold : h.name} · ${formatCurrency(h.marketValue)} · ${formatShare(h.weight)}`,
                keywords: `${h.symbol} ${h.name} ${ASSET_TYPE_LABELS[h.type]}`,
                icon: <span className="wp-dot" style={{ background: ASSET_COLORS[h.type], margin: '0 4px' }} />,
                run: () => router.push(`/portfolio#${encodeURIComponent(h.key)}`),
            });
        }

        list.push(
            {
                id: 'cmd-buy', group: 'Komutlar', label: 'Yeni alış', keywords: 'işlem ekle al buy',
                icon: <IconPlus size={16} />, right: <Text size="xs" c="var(--wp-text-3)">al SEMBOL adet</Text>,
                run: () => openTrade({ side: 'buy' }),
            },
            {
                id: 'cmd-sell', group: 'Komutlar', label: 'Yeni satış', keywords: 'işlem ekle sat sell',
                icon: <IconMinus size={16} />, right: <Text size="xs" c="var(--wp-text-3)">sat SEMBOL adet</Text>,
                run: () => openTrade({ side: 'sell' }),
            },
            {
                id: 'cmd-refresh', group: 'Komutlar', label: 'Fiyatları yenile', keywords: 'güncelle canlı',
                icon: <IconRefresh size={16} />, run: () => void refreshPrices(),
            },
            {
                id: 'cmd-theme', group: 'Komutlar', label: computed === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç', keywords: 'tema karanlık aydınlık görünüm',
                icon: <IconSunMoon size={16} />, run: () => setColorScheme(computed === 'dark' ? 'light' : 'dark'),
            },
            {
                id: 'cmd-backup', group: 'Komutlar', label: 'Yedeği indir', keywords: 'export json yedekle',
                icon: <IconDownload size={16} />, run: () => downloadBackup(),
            },
        );

        return list;
    }, [query, summary.holdings, router, computed, setColorScheme]);

    // The shorthand row always shows when it parsed; everything else is filtered by the query.
    const visible = actions.filter(a => a.id === 'trade-shorthand' || matches(query, a.label, a.description, a.keywords));
    const groups = [...new Set(visible.map(a => a.group))];

    return (
        <Spotlight.Root
            query={query}
            onQueryChange={setQuery}
            shortcut={['mod + K']}
            size={600}
            radius="md"
            clearQueryOnClose
            // Controlled query: reset it ourselves so a reopened palette always starts empty.
            onSpotlightOpen={() => setQuery('')}
            onSpotlightClose={() => setQuery('')}
            classNames={{ content: 'wp-spotlight', actionsList: 'wp-spotlight-list', action: 'wp-spotlight-action', actionsGroup: 'wp-spotlight-group' }}
        >
            <Spotlight.Search placeholder="Sayfa, varlık veya komut ara — örn. al THYAO 10" leftSection={<IconSearch size={16} />} />
            <Spotlight.ActionsList>
                {groups.map(g => (
                    <Spotlight.ActionsGroup key={g} label={g}>
                        {visible.filter(a => a.group === g).map(a => (
                            <Spotlight.Action key={a.id} onClick={() => { setQuery(''); a.run(); }}>
                                <Group wrap="nowrap" gap="sm" w="100%">
                                    <span style={{ display: 'flex', color: 'var(--wp-text-2)', flex: 'none' }}>{a.icon}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <Text size="sm" fw={500} truncate>{a.label}</Text>
                                        {a.description && <Text size="xs" c="var(--wp-text-3)" truncate>{a.description}</Text>}
                                    </div>
                                    {a.right && <span style={{ flex: 'none' }}>{a.right}</span>}
                                </Group>
                            </Spotlight.Action>
                        ))}
                    </Spotlight.ActionsGroup>
                ))}
                {visible.length === 0 && <Spotlight.Empty>Sonuç yok. İşlem için &ldquo;al SEMBOL adet&rdquo; yazmayı deneyin.</Spotlight.Empty>}
            </Spotlight.ActionsList>
            <Group gap="md" px="md" py={8} style={{ borderTop: '1px solid var(--wp-border)' }}>
                <Text size="xs" c="var(--wp-text-3)"><Kbd size="xs">↑</Kbd> <Kbd size="xs">↓</Kbd> gezin</Text>
                <Text size="xs" c="var(--wp-text-3)"><Kbd size="xs">↵</Kbd> seç</Text>
                <Text size="xs" c="var(--wp-text-3)"><Kbd size="xs">esc</Kbd> kapat</Text>
            </Group>
        </Spotlight.Root>
    );
}
