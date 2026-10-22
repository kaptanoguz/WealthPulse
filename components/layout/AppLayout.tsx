'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    AppShell,
    Group,
    Text,
    UnstyledButton,
    Avatar,
    Burger,
    Stack,
    Tooltip,
    ActionIcon,
    useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconDashboard,
    IconBriefcase,
    IconChartLine,
    IconCpu,
    IconReport,
    IconSettings,
    IconSun,
    IconMoon,
    IconActivity,
    IconReceipt2,
    IconNews,
} from '@tabler/icons-react';
import { FEATURES, FeatureName } from '@/lib/features';

const allNavItems: { label: string; icon: typeof IconDashboard; path: string; feature?: FeatureName }[] = [
    { label: 'Özet', icon: IconDashboard, path: '/dashboard' },
    { label: 'Portföy', icon: IconBriefcase, path: '/portfolio' },
    { label: 'Simülasyon', icon: IconCpu, path: '/simulator' },
    { label: 'Piyasalar', icon: IconChartLine, path: '/markets' },
    { label: 'Gelir/Gider', icon: IconReceipt2, path: '/budget', feature: 'budget' },
    { label: 'Haberler', icon: IconNews, path: '/news', feature: 'news' },
    { label: 'Raporlar', icon: IconReport, path: '/reports', feature: 'reports' },
    { label: 'Ayarlar', icon: IconSettings, path: '/settings' },
];

const navItems = allNavItems.filter(item => !item.feature || FEATURES[item.feature]);

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [opened, { toggle }] = useDisclosure(false);
    const { colorScheme, toggleColorScheme } = useMantineColorScheme();
    const [collapsed] = useState(false);

    return (
        <AppShell
            header={{ height: 60 }}
            navbar={{
                width: collapsed ? 80 : 250,
                breakpoint: 'sm',
                collapsed: { mobile: !opened },
            }}
            padding={0}
            styles={{
                main: {
                    background: 'var(--wp-bg-primary)',
                    minHeight: '100vh',
                },
                header: {
                    background: 'var(--wp-bg-secondary)',
                    borderBottom: '1px solid var(--wp-border)',
                },
                navbar: {
                    background: 'var(--wp-bg-secondary)',
                    borderRight: '1px solid var(--wp-border)',
                },
            }}
        >
            {/* ===== HEADER ===== */}
            <AppShell.Header>
                <Group h="100%" px="md" justify="space-between">
                    <Group gap="sm">
                        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                        <Group gap={8} style={{ cursor: 'pointer' }} onClick={() => router.push('/dashboard')}>
                            <IconActivity size={28} color="#3b82f6" stroke={2.5} />
                            <Text
                                fw={800}
                                size="lg"
                                style={{
                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    letterSpacing: '-0.5px',
                                }}
                            >
                                WealthPulse AI
                            </Text>
                        </Group>
                    </Group>

                    <Group gap="sm">
                        <Tooltip label={colorScheme === 'dark' ? 'Açık Tema' : 'Koyu Tema'}>
                            <ActionIcon
                                variant="subtle"
                                size="lg"
                                onClick={() => toggleColorScheme()}
                                color="gray"
                            >
                                {colorScheme === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
                            </ActionIcon>
                        </Tooltip>

                        <Group gap={8} ml="sm" style={{ cursor: 'pointer' }}>
                            <Avatar color="blue" radius="xl" size="sm">
                                OG
                            </Avatar>
                            <Text size="sm" fw={600} visibleFrom="sm">
                                Oğuz K.
                            </Text>
                        </Group>
                    </Group>
                </Group>
            </AppShell.Header>

            {/* ===== SIDEBAR ===== */}
            <AppShell.Navbar p="sm">
                <Stack gap={4} mt="xs">
                    {navItems.map(item => {
                        const isActive = pathname === item.path || pathname?.startsWith(item.path + '/');
                        return (
                            <UnstyledButton
                                key={item.path}
                                onClick={() => {
                                    router.push(item.path);
                                    if (opened) toggle();
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    padding: '10px 14px',
                                    borderRadius: 10,
                                    fontWeight: isActive ? 700 : 500,
                                    fontSize: 14,
                                    color: isActive ? '#3b82f6' : 'var(--wp-text-secondary)',
                                    background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                    transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={e => {
                                    if (!isActive) {
                                        (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!isActive) {
                                        (e.target as HTMLElement).style.background = 'transparent';
                                    }
                                }}
                            >
                                <item.icon size={20} stroke={isActive ? 2.5 : 1.8} />
                                {!collapsed && <span>{item.label}</span>}
                            </UnstyledButton>
                        );
                    })}
                </Stack>

                <div style={{ marginTop: 'auto', padding: '16px 0 8px' }}>
                    <Text size="xs" c="dimmed" ta="center">
                        © 2026 WealthPulse AI
                    </Text>
                </div>
            </AppShell.Navbar>

            {/* ===== MAIN CONTENT ===== */}
            <AppShell.Main>
                {/* Disclaimer Banner */}
                <div className="disclaimer-banner">
                    ⚠️ YATIRIM TAVSİYESİ DEĞİLDİR — SADECE BİLGİLENDİRME AMAÇLIDIR
                </div>

                <div style={{ padding: '24px' }}>
                    {children}
                </div>
            </AppShell.Main>
        </AppShell>
    );
}
