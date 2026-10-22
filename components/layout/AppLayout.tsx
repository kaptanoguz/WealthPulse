'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import {
    AppShell, Box, Burger, Group, Text, ActionIcon, Tooltip, useMantineColorScheme, useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconLayoutDashboard, IconBriefcase2, IconChartArea, IconChartCandle, IconSettings,
    IconReceipt2, IconNews, IconReport, IconSun, IconMoon, IconRefresh,
} from '@tabler/icons-react';
import { FEATURES, FeatureName } from '@/lib/features';
import { refreshPrices, usePriceAutoRefresh, usePriceStatus } from '@/lib/portfolio-store';
import { formatTimestamp } from '@/lib/format';
import CommandPalette, { CommandPaletteTrigger } from '@/components/layout/CommandPalette';
import { TradeModalHost } from '@/components/portfolio/TradeModal';

const allNavItems: { label: string; icon: typeof IconLayoutDashboard; path: string; feature?: FeatureName }[] = [
    { label: 'Özet', icon: IconLayoutDashboard, path: '/dashboard' },
    { label: 'Portföy', icon: IconBriefcase2, path: '/portfolio' },
    { label: 'Simülasyon', icon: IconChartArea, path: '/simulator' },
    { label: 'Piyasalar', icon: IconChartCandle, path: '/markets' },
    { label: 'Gelir/Gider', icon: IconReceipt2, path: '/budget', feature: 'budget' },
    { label: 'Haberler', icon: IconNews, path: '/news', feature: 'news' },
    { label: 'Raporlar', icon: IconReport, path: '/reports', feature: 'reports' },
];

const navItems = allNavItems.filter(item => !item.feature || FEATURES[item.feature]);

const STALE_MS = 10 * 60_000;
const CLOCK_MS = 30_000;

/** Coarse wall clock (30 s resolution) that re-renders subscribers. */
function useClock(): number {
    return useSyncExternalStore(
        cb => { const id = setInterval(cb, CLOCK_MS); return () => clearInterval(id); },
        () => Math.floor(Date.now() / CLOCK_MS) * CLOCK_MS,
        () => 0,
    );
}

function Wordmark() {
    return (
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--wp-text)' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <rect width="18" height="18" rx="4" fill="var(--wp-accent)" />
                <path d="M3.5 11.5 L7 8 L9.5 10.5 L14.5 5.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <Text fw={650} size="sm" style={{ letterSpacing: '-0.01em' }}>WealthPulse</Text>
        </Link>
    );
}

function PriceIndicator() {
    const status = usePriceStatus();
    const now = useClock();
    const stale = !status.updatedAt || now - new Date(status.updatedAt).getTime() > STALE_MS;
    const color = status.error ? 'var(--wp-warn)' : stale ? 'var(--wp-text-3)' : 'var(--wp-pos)';
    const label = status.loading
        ? 'Fiyatlar güncelleniyor…'
        : status.updatedAt
            ? `Fiyatlar ${formatTimestamp(status.updatedAt)}`
            : 'Fiyat alınmadı';

    return (
        <Group gap={6} wrap="nowrap">
            <Tooltip label={status.error ?? (stale ? 'Fiyatlar güncel değil' : 'Canlı fiyatlar')}>
                <Group gap={6} wrap="nowrap" style={{ cursor: 'default' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: color }} />
                    <Text size="xs" c="var(--wp-text-2)" visibleFrom="xs">{label}</Text>
                </Group>
            </Tooltip>
            <Tooltip label="Fiyatları yenile">
                <ActionIcon size="sm" onClick={() => void refreshPrices()} loading={status.loading} aria-label="Fiyatları yenile">
                    <IconRefresh size={14} />
                </ActionIcon>
            </Tooltip>
        </Group>
    );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [opened, { toggle, close }] = useDisclosure(false);
    const { setColorScheme } = useMantineColorScheme();
    const computed = useComputedColorScheme('dark', { getInitialValueInEffect: true });
    usePriceAutoRefresh();

    return (
        <AppShell
            header={{ height: 48 }}
            navbar={{ width: 216, breakpoint: 'sm', collapsed: { mobile: !opened } }}
            padding={0}
            styles={{
                main: { background: 'var(--wp-bg)', minHeight: '100vh' },
                header: { background: 'var(--wp-chrome)', borderBottom: '1px solid var(--wp-border)' },
                navbar: { background: 'var(--wp-chrome)', borderRight: '1px solid var(--wp-border)' },
            }}
        >
            <AppShell.Header>
                <Group h="100%" px="md" justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="xs" aria-label="Menü" />
                        <Wordmark />
                    </Group>
                    <CommandPaletteTrigger />
                    <Group gap="md" wrap="nowrap">
                        <PriceIndicator />
                        {/* Both icons are rendered and hidden with CSS, so server and client markup match. */}
                        <Tooltip label="Temayı değiştir">
                            <ActionIcon size="sm" aria-label="Temayı değiştir"
                                onClick={() => setColorScheme(computed === 'dark' ? 'light' : 'dark')}>
                                <Box component={IconSun} size={15} lightHidden />
                                <Box component={IconMoon} size={15} darkHidden />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>
            </AppShell.Header>

            <AppShell.Navbar p="sm">
                <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {navItems.map(item => {
                        const active = pathname === item.path || pathname?.startsWith(item.path + '/');
                        return (
                            <Link key={item.path} href={item.path} className="wp-nav-link" data-active={active} onClick={close}>
                                <item.icon size={16} stroke={1.75} />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
                <div style={{ marginTop: 'auto' }}>
                    <Link href="/settings" className="wp-nav-link" data-active={pathname === '/settings'} onClick={close}>
                        <IconSettings size={16} stroke={1.75} />
                        Ayarlar
                    </Link>
                </div>
            </AppShell.Navbar>

            <AppShell.Main>
                <div style={{ padding: '24px', maxWidth: 1440, margin: '0 auto' }}>
                    {children}
                    <Text size="xs" c="var(--wp-text-3)" mt={40} pb={8}>
                        Bilgilendirme amaçlıdır, yatırım tavsiyesi değildir. Veriler yalnızca bu cihazda saklanır.
                    </Text>
                </div>
            </AppShell.Main>

            <CommandPalette />
            <TradeModalHost />
        </AppShell>
    );
}
