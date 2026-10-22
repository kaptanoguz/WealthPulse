'use client';

import { useRef } from 'react';
import { Text, Group, Button, SegmentedControl, Stack, useMantineColorScheme, MantineColorScheme } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconUpload, IconTrash } from '@tabler/icons-react';
import { downloadBackup, portfolioActions, usePortfolioState, useStoreReady } from '@/lib/portfolio-store';
import { FEATURES } from '@/lib/features';
import { formatDate, formatTimestamp } from '@/lib/format';
import { PageHeader, Panel } from '@/components/ui/primitives';

const MODULE_LABELS: Record<keyof typeof FEATURES, string> = {
    budget: 'Gelir / gider takibi',
    news: 'Ekonomi haberleri',
    reports: 'Raporlar',
    aiChat: 'AI asistan',
};

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
    return (
        <Group justify="space-between" wrap="nowrap" gap="lg" py={12} style={{ borderBottom: '1px solid var(--wp-border)' }}>
            <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={500}>{label}</Text>
                {description && <Text size="xs" c="var(--wp-text-3)" mt={2}>{description}</Text>}
            </div>
            <div style={{ flex: 'none' }}>{children}</div>
        </Group>
    );
}

export default function SettingsPage() {
    const { colorScheme, setColorScheme } = useMantineColorScheme();
    const state = usePortfolioState();
    const ready = useStoreReady();
    const fileRef = useRef<HTMLInputElement>(null);

    const firstTrade = state.trades.reduce<string | null>((min, t) => (!min || t.date < min ? t.date : min), null);

    const importBackup = async (file: File) => {
        const text = await file.text();
        modals.openConfirmModal({
            title: <Text fw={600}>Yedekten geri yükle</Text>,
            children: <Text size="sm">Mevcut tüm veriler yedekteki verilerle değiştirilecek.</Text>,
            labels: { confirm: 'Geri yükle', cancel: 'Vazgeç' },
            onConfirm: () => {
                const err = portfolioActions.importJson(text);
                notifications.show(err
                    ? { title: 'Geri yüklenemedi', message: err, color: 'red' }
                    : { title: 'Yedek yüklendi', message: 'Portföy yedekten geri yüklendi.', color: 'teal' });
            },
        });
    };

    const clearAll = () => {
        modals.openConfirmModal({
            title: <Text fw={600}>Tüm verileri sil</Text>,
            children: (
                <Text size="sm">
                    {state.trades.length} işlem, kayıtlı fiyatlar ve değer geçmişi bu cihazdan kalıcı olarak silinecek.
                    Devam etmeden önce yedek almanızı öneririz.
                </Text>
            ),
            labels: { confirm: 'Kalıcı olarak sil', cancel: 'Vazgeç' },
            confirmProps: { color: 'red' },
            onConfirm: () => {
                portfolioActions.clear();
                notifications.show({ title: 'Veriler silindi', message: 'Portföy sıfırlandı.', color: 'gray' });
            },
        });
    };

    return (
        <>
            <PageHeader title="Ayarlar" />
            <Stack gap={16} maw={760}>
                <Panel title="Görünüm">
                    <Row label="Tema" description="Sistem seçeneği işletim sisteminizin ayarını izler.">
                        {/* The stored scheme is only known on the client; render after mount to keep hydration exact. */}
                        {ready && <SegmentedControl
                            size="sm"
                            value={colorScheme}
                            onChange={v => setColorScheme(v as MantineColorScheme)}
                            data={[{ value: 'light', label: 'Açık' }, { value: 'dark', label: 'Koyu' }, { value: 'auto', label: 'Sistem' }]}
                        />}
                    </Row>
                    <Row label="Para birimi" description="Tüm değerler Türk lirası üzerinden raporlanır; döviz varlıklar güncel kurla çevrilir.">
                        <Text size="sm" c="var(--wp-text-2)">TRY</Text>
                    </Row>
                </Panel>

                <Panel title="Veriler">
                    <Text size="sm" c="var(--wp-text-2)" mb={4}>
                        Portföy verileri yalnızca bu cihazda, tarayıcı deposunda tutulur; hiçbir sunucuya gönderilmez.
                        Cihaz değiştirmeden veya tarayıcı verilerini temizlemeden önce yedek alın.
                    </Text>
                    <Row
                        label="Kayıtlı veri"
                        description={ready
                            ? `${state.trades.length} işlem · ${state.snapshots.length} günlük değer kaydı${firstTrade ? ` · ilk işlem ${formatDate(firstTrade)}` : ''}`
                            : ' '}
                    >
                        <Text size="xs" c="var(--wp-text-3)">
                            {state.quotesUpdatedAt ? `Fiyatlar ${formatTimestamp(state.quotesUpdatedAt)}` : ''}
                        </Text>
                    </Row>
                    <Row label="Yedeği indir" description="Tüm işlemler, fiyatlar ve geçmiş tek bir JSON dosyasında.">
                        <Button variant="default" leftSection={<IconDownload size={15} />} onClick={downloadBackup} disabled={state.trades.length === 0}>
                            İndir
                        </Button>
                    </Row>
                    <Row label="Yedekten geri yükle" description="Mevcut verilerin yerini alır.">
                        <Button variant="default" leftSection={<IconUpload size={15} />} onClick={() => fileRef.current?.click()}>
                            Dosya seç
                        </Button>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="application/json,.json"
                            hidden
                            data-testid="settings-backup-input"
                            onChange={e => {
                                const f = e.currentTarget.files?.[0];
                                e.currentTarget.value = '';
                                if (f) void importBackup(f);
                            }}
                        />
                    </Row>
                    <Group justify="space-between" wrap="nowrap" gap="lg" pt={12}>
                        <div>
                            <Text size="sm" fw={500} c="var(--wp-neg)">Tüm verileri sil</Text>
                            <Text size="xs" c="var(--wp-text-3)" mt={2}>Bu işlem geri alınamaz.</Text>
                        </div>
                        <Button color="red" variant="light" leftSection={<IconTrash size={15} />} onClick={clearAll} disabled={state.trades.length === 0 && state.snapshots.length === 0}>
                            Sil
                        </Button>
                    </Group>
                </Panel>

                <Panel title="Modüller">
                    <Text size="sm" c="var(--wp-text-2)">
                        Uygulama portföy takibi ve simülasyona odaklanır. Aşağıdaki modüller kod tabanında duruyor ancak gerçek veri,
                        kalıcı depolama ve testlerle aynı seviyeye getirilene kadar kapalıdır.
                    </Text>
                    {(Object.keys(FEATURES) as (keyof typeof FEATURES)[]).map(k => (
                        <Row key={k} label={MODULE_LABELS[k]}>
                            <Text size="xs" c={FEATURES[k] ? 'var(--wp-pos)' : 'var(--wp-text-3)'}>{FEATURES[k] ? 'Açık' : 'Kapalı'}</Text>
                        </Row>
                    ))}
                </Panel>

                <Panel title="Veri kaynakları">
                    <Stack gap={6}>
                        <Text size="sm"><Text span fw={500}>Hisse, ETF, fon:</Text> <Text span c="var(--wp-text-2)">Yahoo Finance (gecikmeli olabilir)</Text></Text>
                        <Text size="sm"><Text span fw={500}>Altın ve döviz:</Text> <Text span c="var(--wp-text-2)">Kuyumcular Odası (Truncgil); döviz için Yahoo yedek kaynak</Text></Text>
                        <Text size="sm"><Text span fw={500}>Kripto:</Text> <Text span c="var(--wp-text-2)">CoinGecko (USD)</Text></Text>
                        <Text size="xs" c="var(--wp-text-3)" mt={4}>Fiyatlar her 2 dakikada bir yenilenir. Kaynak yanıt vermezse son bilinen fiyat kullanılır.</Text>
                    </Stack>
                </Panel>
            </Stack>
        </>
    );
}
