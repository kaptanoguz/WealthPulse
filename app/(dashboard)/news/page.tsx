'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Stack, Text, Group, Paper, Badge, Loader, SegmentedControl,
    ActionIcon, Tooltip, Anchor,
} from '@mantine/core';
import {
    IconRefresh, IconExternalLink, IconClock,
    IconChartLine, IconCoin, IconCurrencyDollar, IconCurrencyBitcoin, IconNews,
} from '@tabler/icons-react';

interface NewsItem {
    title: string;
    link: string;
    pubDate: string;
    source: string;
    category: string;
}

const categoryConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    ekonomi: { label: 'Ekonomi', color: 'blue', icon: <IconNews size={14} /> },
    borsa: { label: 'Borsa', color: 'green', icon: <IconChartLine size={14} /> },
    doviz: { label: 'Döviz', color: 'teal', icon: <IconCurrencyDollar size={14} /> },
    kripto: { label: 'Kripto', color: 'grape', icon: <IconCurrencyBitcoin size={14} /> },
    altin: { label: 'Altın', color: 'yellow', icon: <IconCoin size={14} /> },
};

const filters = [
    { label: 'Tümü', value: 'all' },
    { label: 'Ekonomi', value: 'ekonomi' },
    { label: 'Borsa', value: 'borsa' },
    { label: 'Döviz', value: 'doviz' },
    { label: 'Kripto', value: 'kripto' },
    { label: 'Altın', value: 'altin' },
];

function timeAgo(dateStr: string): string {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} dk önce`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} saat önce`;
    const days = Math.floor(hours / 24);
    return `${days} gün önce`;
}

export default function NewsPage() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    const fetchNews = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/news');
            if (res.ok) {
                const json = await res.json();
                setNews(json.data || []);
            }
        } catch {
            // silent fail
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const first = setTimeout(fetchNews, 0);
        const interval = setInterval(fetchNews, 600_000); // 10 min
        return () => { clearTimeout(first); clearInterval(interval); };
    }, [fetchNews]);

    const filtered = filter === 'all' ? news : news.filter(n => n.category === filter);

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="center">
                <Group gap={8}>
                    <Text size="xl" fw={800}>📰 Ekonomi Haberleri</Text>
                    <Badge size="sm" color="blue" variant="light">{news.length} haber</Badge>
                </Group>
                <Tooltip label="Haberleri yenile">
                    <ActionIcon variant="subtle" color="gray" onClick={fetchNews} loading={loading} size="sm">
                        <IconRefresh size={16} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <SegmentedControl
                value={filter}
                onChange={setFilter}
                data={filters}
                size="sm"
                styles={{ root: { background: 'var(--wp-bg-card)' } }}
            />

            {loading && news.length === 0 ? (
                <Group justify="center" mt="xl">
                    <Loader size="lg" />
                    <Text c="dimmed">Haberler yükleniyor...</Text>
                </Group>
            ) : (
                <Stack gap="sm">
                    {filtered.map((item, i) => {
                        const cat = categoryConfig[item.category] || categoryConfig.ekonomi;
                        return (
                            <Paper
                                key={i}
                                p="md"
                                radius="md"
                                style={{
                                    background: 'var(--wp-bg-card)',
                                    border: '1px solid var(--wp-border)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                                className="news-card"
                            >
                                <Group justify="space-between" align="flex-start" wrap="nowrap">
                                    <Stack gap={6} style={{ flex: 1 }}>
                                        <Group gap={8}>
                                            <Badge size="xs" color={cat.color} variant="light" leftSection={cat.icon}>
                                                {cat.label}
                                            </Badge>
                                            <Text size="xs" c="dimmed">{item.source}</Text>
                                        </Group>
                                        <Anchor
                                            href={item.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            underline="never"
                                            c="white"
                                        >
                                            <Text fw={600} size="sm" lineClamp={2} style={{ lineHeight: 1.4 }}>
                                                {item.title}
                                            </Text>
                                        </Anchor>
                                        {item.pubDate && (
                                            <Group gap={4}>
                                                <IconClock size={12} color="#64748b" />
                                                <Text size="xs" c="dimmed">{timeAgo(item.pubDate)}</Text>
                                            </Group>
                                        )}
                                    </Stack>
                                    <Anchor href={item.link} target="_blank" rel="noopener noreferrer">
                                        <ActionIcon variant="subtle" color="gray" size="sm">
                                            <IconExternalLink size={16} />
                                        </ActionIcon>
                                    </Anchor>
                                </Group>
                            </Paper>
                        );
                    })}
                </Stack>
            )}

            {!loading && filtered.length === 0 && (
                <Text ta="center" c="dimmed" mt="xl">Bu kategoride haber bulunamadı.</Text>
            )}
        </Stack>
    );
}
