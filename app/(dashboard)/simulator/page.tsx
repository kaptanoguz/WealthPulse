'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Text, Group, NumberInput, Select, Button, SegmentedControl, Stack, Alert, Skeleton,
} from '@mantine/core';
import { IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import {
    ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine,
} from 'recharts';
import {
    AssetType, ASSET_TYPE_LABELS, ClassAssumption, DEFAULT_ASSUMPTIONS, allocationByType, blendAssumptions,
} from '@/lib/portfolio';
import { usePortfolio, useStoreReady } from '@/lib/portfolio-store';
import { MonteCarloParams, MonteCarloResult, runMonteCarlo, validateParams, histogram } from '@/lib/montecarlo';
import { formatCompactTRY, formatShare, formatProbability, formatCurrency0, formatNumber } from '@/lib/format';
import { PageHeader, Panel, StatStrip, ChartTooltip, axisProps } from '@/components/ui/primitives';
import { ASSET_COLORS } from '@/components/ui/asset-colors';

const PRESETS = [
    { label: 'Temkinli', ret: 20, vol: 15 },
    { label: 'Dengeli', ret: 30, vol: 25 },
    { label: 'Agresif', ret: 40, vol: 40 },
];

const toPct = (v: number) => Math.round(v * 1000) / 10; // 0.355 → 35.5
const fromPct = (v: number | string) => Number(v) / 100;
const moneyInput = { thousandSeparator: '.', decimalSeparator: ',', hideControls: true, prefix: '₺' } as const;
const pctInput = { decimalSeparator: ',', hideControls: true, suffix: ' %' } as const;

export default function SimulatorPage() {
    const { summary } = usePortfolio();
    const ready = useStoreReady();
    const allocation = useMemo(() => allocationByType(summary.holdings), [summary.holdings]);
    const hasPortfolio = summary.totalValue > 0;

    const [mode, setMode] = useState<'portfolio' | 'manual'>('portfolio');
    const [initial, setInitial] = useState<number | string>('');
    const [monthly, setMonthly] = useState<number | string>(0);
    const [years, setYears] = useState<number | string>(10);
    const [inflation, setInflation] = useState<number | string>(30);
    const [target, setTarget] = useState<number | string>('');
    const [simulations, setSimulations] = useState<string | null>('5000');
    const [seed, setSeed] = useState(42);
    const [manualReturn, setManualReturn] = useState<number | string>(30);
    const [manualVol, setManualVol] = useState<number | string>(25);
    const [classAssumptions, setClassAssumptions] = useState<Record<AssetType, ClassAssumption>>(DEFAULT_ASSUMPTIONS);
    const [view, setView] = useState<'real' | 'nominal'>('real');
    const [result, setResult] = useState<MonteCarloResult | null>(null);
    const [running, setRunning] = useState(false);

    const effectiveMode = hasPortfolio ? mode : 'manual';
    // Empty field means "use the portfolio value".
    const initialValue = initial === '' ? summary.totalValue : Number(initial);

    const blended = useMemo(() => {
        const weights: Partial<Record<AssetType, number>> = {};
        for (const a of allocation) weights[a.type] = a.value;
        return blendAssumptions(weights, classAssumptions);
    }, [allocation, classAssumptions]);

    const assumption: ClassAssumption = effectiveMode === 'portfolio' && blended
        ? blended
        : { annualReturn: fromPct(manualReturn), annualVolatility: fromPct(manualVol) };

    const params: MonteCarloParams = {
        initialValue,
        monthlyContribution: Number(monthly) || 0,
        years: Number(years),
        annualReturn: assumption.annualReturn,
        annualVolatility: assumption.annualVolatility,
        annualInflation: fromPct(inflation),
        simulations: Number(simulations),
        target: Number(target) || 0,
        seed,
    };
    const errors = validateParams(params);
    const paramsKey = JSON.stringify(params);
    const stale = result !== null && JSON.stringify(result.params) !== paramsKey;

    const run = (p: MonteCarloParams) => {
        if (validateParams(p).length) return;
        setRunning(true);
        // Yield one frame so the button shows its loading state before the synchronous run.
        setTimeout(() => {
            setResult(runMonteCarlo(p));
            setRunning(false);
        }, 16);
    };

    // Run once automatically when the page opens with a portfolio.
    const autoRan = useRef(false);
    useEffect(() => {
        if (!ready || autoRan.current || !hasPortfolio || errors.length) return;
        autoRan.current = true;
        run(params);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, hasPortfolio]);

    const rows = useMemo(() => (result ? (view === 'real' ? result.real : result.nominal) : []), [result, view]);

    const fanData = useMemo(() => {
        if (!result) return [];
        const { initialValue: init, monthlyContribution, annualInflation } = result.params;
        const step = result.months > 120 ? 3 : 1;
        let invested = init;
        const out = [];
        for (const r of rows) {
            if (r.month > 0) invested += view === 'real' ? monthlyContribution / Math.pow(1 + annualInflation, r.month / 12) : monthlyContribution;
            if (r.month % step !== 0 && r.month !== result.months) continue;
            out.push({ year: r.month / 12, outer: [r.p10, r.p90], inner: [r.p25, r.p75], p50: r.p50, invested });
        }
        return out;
    }, [result, rows, view]);

    const yearly = useMemo(() => rows.filter(r => r.month > 0 && r.month % 12 === 0), [rows]);

    const hist = useMemo(() => {
        if (!result) return [];
        const values = view === 'real' ? result.finalReal : result.finalNominal;
        // Fold the long right tail into the last bucket so the body of the distribution stays readable.
        const sorted = Float64Array.from(values).sort();
        const cap = sorted[Math.floor(sorted.length * 0.98)];
        return histogram(sorted.map(v => Math.min(v, cap)), 30).map(b => ({ mid: (b.lo + b.hi) / 2, lo: b.lo, hi: b.hi, count: b.count }));
    }, [result, view]);

    const final = rows[rows.length - 1];
    const invested = result ? (view === 'real' ? result.totalInvestedReal : result.totalInvested) : 0;
    const unit = view === 'real' ? 'bugünkü ₺' : 'nominal ₺';

    return (
        <>
            <PageHeader
                title="Simülasyon"
                description="Portföyünüzün olası değer aralığı, Monte Carlo yöntemiyle ve enflasyondan arındırılmış olarak."
            />

            <div className="wp-sim-grid">
                {/* ---- Parameters ---- */}
                <Stack gap={16} className="wp-sim-params">
                    <Panel title="Parametreler">
                        <Stack gap="sm">
                            <NumberInput
                                label="Başlangıç değeri"
                                description={hasPortfolio ? (initial === '' ? 'Portföyün güncel değeri' : <Text span size="xs" c="var(--wp-accent)" style={{ cursor: 'pointer' }} onClick={() => setInitial('')}>Portföy değerine dön</Text>) : 'Portföy boş; bir tutar girin'}
                                placeholder={hasPortfolio ? formatCurrency0(summary.totalValue) : '₺500.000'}
                                value={initial}
                                onChange={setInitial}
                                min={0}
                                {...moneyInput}
                            />
                            <Group grow align="flex-start" gap="sm">
                                <NumberInput label="Aylık ek yatırım" value={monthly} onChange={setMonthly} min={0} {...moneyInput} />
                                <NumberInput label="Süre (yıl)" value={years} onChange={setYears} min={1} max={50} allowDecimal={false} hideControls />
                            </Group>
                            <Group grow align="flex-start" gap="sm">
                                <NumberInput label="Yıllık enflasyon" value={inflation} onChange={setInflation} min={-20} max={500} decimalScale={1} {...pctInput} />
                                <NumberInput label="Hedef (bugünkü ₺)" placeholder="Yok" value={target} onChange={setTarget} min={0} {...moneyInput} />
                            </Group>
                            <Select
                                label="Senaryo sayısı"
                                data={[{ value: '1000', label: '1.000' }, { value: '5000', label: '5.000' }, { value: '10000', label: '10.000' }]}
                                value={simulations}
                                onChange={setSimulations}
                                allowDeselect={false}
                            />
                        </Stack>
                    </Panel>

                    <Panel
                        title="Getiri varsayımları"
                        padded={false}
                        actions={
                            <SegmentedControl
                                value={effectiveMode}
                                onChange={v => setMode(v as 'portfolio' | 'manual')}
                                data={[
                                    { value: 'portfolio', label: 'Portföyden', disabled: !hasPortfolio },
                                    { value: 'manual', label: 'Manuel' },
                                ]}
                            />
                        }
                    >
                        {effectiveMode === 'portfolio' ? (
                            <>
                                <table className="wp-table">
                                    <thead>
                                        <tr><th>Sınıf</th><th className="num">Ağırlık</th><th className="num" style={{ width: 84 }}>Getiri</th><th className="num" style={{ width: 84 }}>Oynaklık</th></tr>
                                    </thead>
                                    <tbody>
                                        {allocation.map(a => (
                                            <tr key={a.type}>
                                                <td>
                                                    <Group gap={8} wrap="nowrap">
                                                        <span className="wp-dot" style={{ background: ASSET_COLORS[a.type] }} />
                                                        {ASSET_TYPE_LABELS[a.type]}
                                                    </Group>
                                                </td>
                                                <td className="num wp-muted">{formatShare(a.weight)}</td>
                                                <td style={{ padding: '4px 6px' }}>
                                                    <NumberInput size="xs" aria-label={`${ASSET_TYPE_LABELS[a.type]} getiri`} value={toPct(classAssumptions[a.type].annualReturn)} decimalScale={1} min={-50} max={300} {...pctInput}
                                                        onChange={v => setClassAssumptions(c => ({ ...c, [a.type]: { ...c[a.type], annualReturn: fromPct(v) } }))} />
                                                </td>
                                                <td style={{ padding: '4px 6px' }}>
                                                    <NumberInput size="xs" aria-label={`${ASSET_TYPE_LABELS[a.type]} oynaklık`} value={toPct(classAssumptions[a.type].annualVolatility)} decimalScale={1} min={0} max={300} {...pctInput}
                                                        onChange={v => setClassAssumptions(c => ({ ...c, [a.type]: { ...c[a.type], annualVolatility: fromPct(v) } }))} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {blended && (
                                        <tfoot>
                                            <tr>
                                                <td>Portföy</td>
                                                <td />
                                                <td className="num" data-testid="blended-return">{formatShare(blended.annualReturn * 100)}</td>
                                                <td className="num">{formatShare(blended.annualVolatility * 100)}</td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                                <Group justify="space-between" align="flex-start" px="md" py="sm" gap="xs" wrap="nowrap" style={{ borderTop: '1px solid var(--wp-border)' }}>
                                    <Text size="xs" c="var(--wp-text-3)">
                                        Yıllık, TL bazında nominal varsayımlar. Sınıflar arası korelasyon hesaba katılır. Bunlar tahmin değil, değiştirebileceğiniz başlangıç değerleridir.
                                    </Text>
                                    <Button variant="subtle" size="compact-xs" onClick={() => setClassAssumptions(DEFAULT_ASSUMPTIONS)} style={{ flex: 'none' }}>Sıfırla</Button>
                                </Group>
                            </>
                        ) : (
                            <Stack gap="sm" p="md">
                                <Group grow gap="sm">
                                    <NumberInput label="Beklenen yıllık getiri" value={manualReturn} onChange={setManualReturn} min={-50} max={300} decimalScale={1} {...pctInput} />
                                    <NumberInput label="Yıllık oynaklık" value={manualVol} onChange={setManualVol} min={0} max={300} decimalScale={1} {...pctInput} />
                                </Group>
                                <Group gap={6}>
                                    {PRESETS.map(p => (
                                        <Button key={p.label} variant="default" size="compact-xs" onClick={() => { setManualReturn(p.ret); setManualVol(p.vol); }}>
                                            {p.label} · %{p.ret} / %{p.vol}
                                        </Button>
                                    ))}
                                </Group>
                            </Stack>
                        )}
                    </Panel>

                    {errors.length > 0 && <Alert color="red" variant="light" p="xs">{errors.join(' ')}</Alert>}
                    <Group grow gap="xs">
                        <Button leftSection={<IconPlayerPlay size={15} />} onClick={() => run(params)} loading={running} disabled={errors.length > 0}>
                            {result ? 'Yeniden hesapla' : 'Hesapla'}
                        </Button>
                        {result && (
                            <Button variant="default" leftSection={<IconRefresh size={15} />} disabled={errors.length > 0 || running}
                                onClick={() => { const s = seed + 1; setSeed(s); run({ ...params, seed: s }); }}>
                                Yeni örneklem
                            </Button>
                        )}
                    </Group>
                </Stack>

                {/* ---- Results ---- */}
                <Stack gap={16} className="wp-sim-results" style={{ minWidth: 0 }}>
                    {!ready || (running && !result) ? (
                        <Skeleton h={480} radius={8} />
                    ) : !result || !final ? (
                        <Panel>
                            <Stack align="center" gap={6} py={64}>
                                <Text fw={600}>Henüz sonuç yok</Text>
                                <Text size="sm" c="var(--wp-text-2)" ta="center" maw={420}>
                                    Parametreleri girip Hesapla&apos;ya basın. Sonuçlar binlerce olası piyasa senaryosunun dağılımını gösterir.
                                </Text>
                            </Stack>
                        </Panel>
                    ) : (
                        <>
                            <Group justify="space-between">
                                <Group gap="xs">
                                    <Text fw={600}>{result.params.years} yıl sonra</Text>
                                    {stale && <Text size="xs" c="var(--wp-warn)">Parametreler değişti; sonuçlar güncel değil</Text>}
                                </Group>
                                <SegmentedControl
                                    value={view}
                                    onChange={v => setView(v as 'real' | 'nominal')}
                                    data={[{ value: 'real', label: 'Bugünkü ₺ (reel)' }, { value: 'nominal', label: 'Nominal ₺' }]}
                                />
                            </Group>

                            <StatStrip
                                items={[
                                    { label: 'Kötü senaryo · P10', value: formatCurrency0(final.p10), sub: '10 senaryodan 1’i daha kötü' },
                                    { label: 'Medyan · P50', value: formatCurrency0(final.p50), sub: `Ortalama ${formatCurrency0(view === 'real' ? result.meanFinalReal : result.meanFinalNominal)}` },
                                    { label: 'İyi senaryo · P90', value: formatCurrency0(final.p90), sub: '10 senaryodan 1’i daha iyi' },
                                    { label: 'Toplam yatırılan', value: formatCurrency0(invested), sub: unit },
                                ]}
                            />
                            <StatStrip
                                items={[
                                    {
                                        label: 'Enflasyonun gerisinde kalma',
                                        value: formatProbability(result.probRealLoss),
                                        tone: result.probRealLoss >= 0.5 ? 'neg' : result.probRealLoss >= 0.25 ? 'warn' : 'neutral',
                                        sub: 'Reel olarak yatırılandan az',
                                    },
                                    {
                                        label: 'Nominal zarar',
                                        value: formatProbability(result.probNominalLoss),
                                        tone: result.probNominalLoss >= 0.25 ? 'neg' : 'neutral',
                                        sub: 'TL olarak yatırılandan az',
                                    },
                                    {
                                        label: 'Hedefe ulaşma',
                                        value: result.probTarget === null ? '—' : formatProbability(result.probTarget),
                                        tone: result.probTarget === null ? 'neutral' : result.probTarget >= 0.5 ? 'pos' : 'neutral',
                                        sub: result.probTarget === null ? 'Hedef girilmedi' : `${formatCurrency0(result.params.target)} (bugünkü ₺)`,
                                    },
                                    {
                                        label: 'Tipik en büyük düşüş',
                                        value: `−${formatShare(result.medianMaxDrawdown * 100)}`,
                                        tone: 'warn',
                                        sub: 'Zirveden dibe, medyan senaryo',
                                    },
                                ]}
                            />

                            <Panel title={`Olası değer aralığı (${unit})`}>
                                <Group gap="lg" mb="sm">
                                    <Group gap={6}><span className="wp-dot" style={{ background: 'var(--wp-c1)', opacity: 0.25 }} /><Text size="xs" c="var(--wp-text-2)">P10–P90</Text></Group>
                                    <Group gap={6}><span className="wp-dot" style={{ background: 'var(--wp-c1)', opacity: 0.5 }} /><Text size="xs" c="var(--wp-text-2)">P25–P75</Text></Group>
                                    <Group gap={6}><span className="wp-dot" style={{ background: 'var(--wp-c1)' }} /><Text size="xs" c="var(--wp-text-2)">Medyan</Text></Group>
                                    <Group gap={6}><span className="wp-dot" style={{ background: 'var(--wp-text-3)' }} /><Text size="xs" c="var(--wp-text-2)">Yatırılan</Text></Group>
                                </Group>
                                <ResponsiveContainer width="100%" height={300} initialDimension={{ width: 600, height: 300 }}>
                                    <ComposedChart data={fanData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                                        <CartesianGrid vertical={false} stroke="var(--wp-grid)" />
                                        <XAxis dataKey="year" type="number" domain={[0, result.params.years]} {...axisProps}
                                            tickFormatter={v => `${v}. yıl`} allowDecimals={false} />
                                        <YAxis {...axisProps} tickFormatter={formatCompactTRY} width={64} />
                                        <Tooltip
                                            cursor={{ stroke: 'var(--wp-border-strong)' }}
                                            content={<ChartTooltip
                                                title={l => `${Number(l).toFixed(1).replace('.', ',')}. yıl`}
                                                rows={e => {
                                                    const v = e.value;
                                                    if (e.dataKey === 'outer' && Array.isArray(v)) return { label: 'P10 – P90', value: `${formatCompactTRY(v[0])} – ${formatCompactTRY(v[1])}` };
                                                    if (e.dataKey === 'inner' && Array.isArray(v)) return { label: 'P25 – P75', value: `${formatCompactTRY(v[0])} – ${formatCompactTRY(v[1])}` };
                                                    if (e.dataKey === 'p50') return { label: 'Medyan', value: formatCurrency0(Number(v)), color: 'var(--wp-c1)' };
                                                    return { label: 'Yatırılan', value: formatCurrency0(Number(v)), color: 'var(--wp-text-3)' };
                                                }}
                                            />}
                                        />
                                        <Area dataKey="outer" stroke="none" fill="var(--wp-c1)" fillOpacity={0.12} isAnimationActive={false} />
                                        <Area dataKey="inner" stroke="none" fill="var(--wp-c1)" fillOpacity={0.22} isAnimationActive={false} />
                                        <Line dataKey="p50" stroke="var(--wp-c1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                                        <Line dataKey="invested" stroke="var(--wp-text-3)" strokeWidth={1} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </Panel>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
                                <Panel title={`Sonuç dağılımı · ${result.params.simulations.toLocaleString('tr-TR')} senaryo`}>
                                    <ResponsiveContainer width="100%" height={240} initialDimension={{ width: 600, height: 240 }}>
                                        <BarChart data={hist} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap={1}>
                                            <CartesianGrid vertical={false} stroke="var(--wp-grid)" />
                                            <XAxis dataKey="mid" type="number" domain={['dataMin', 'dataMax']} {...axisProps} tickFormatter={formatCompactTRY} />
                                            <YAxis {...axisProps} width={44} tickFormatter={v => formatNumber(Number(v), 0)} allowDecimals={false} />
                                            <Tooltip
                                                cursor={{ fill: 'var(--wp-surface-2)' }}
                                                content={<ChartTooltip
                                                    title={() => 'Son değer aralığı'}
                                                    rows={e => {
                                                        const b = e.payload as { lo: number; hi: number } | undefined;
                                                        return { label: b ? `${formatCompactTRY(b.lo)} – ${formatCompactTRY(b.hi)}` : '', value: `${e.value} senaryo` };
                                                    }}
                                                />}
                                            />
                                            <ReferenceLine x={invested} stroke="var(--wp-text-3)" strokeDasharray="4 4"
                                                label={{ value: 'Yatırılan', position: 'top', fill: 'var(--wp-text-3)', fontSize: 11 }} />
                                            <Bar dataKey="count" fill="var(--wp-c1)" fillOpacity={0.85} isAnimationActive={false} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                    <Text size="xs" c="var(--wp-text-3)" mt={6}>En yüksek %2’lik dilim son sütuna dahil edilmiştir.</Text>
                                </Panel>

                                <Panel title={`Yıllara göre (${unit})`} padded={false}>
                                    <div style={{ maxHeight: 290, overflowY: 'auto' }}>
                                        <table className="wp-table" data-testid="yearly-table">
                                            <thead style={{ position: 'sticky', top: 0 }}>
                                                <tr><th>Yıl</th><th className="num">P10</th><th className="num">P50</th><th className="num">P90</th></tr>
                                            </thead>
                                            <tbody>
                                                {yearly.map(r => (
                                                    <tr key={r.month}>
                                                        <td className="wp-muted">{r.month / 12}</td>
                                                        <td className="num">{formatCompactTRY(r.p10)}</td>
                                                        <td className="num" style={{ fontWeight: 600 }}>{formatCompactTRY(r.p50)}</td>
                                                        <td className="num">{formatCompactTRY(r.p90)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Panel>
                            </div>

                            <Text size="xs" c="var(--wp-text-3)">
                                Model: aylık log-normal getiriler (geometrik Brown hareketi); sabit getiri, oynaklık ve enflasyon; katkılar ay sonunda eklenir.
                                Gerçek piyasalarda kalın kuyruklar, rejim değişiklikleri ve kur şokları bu modelin öngördüğünden sert olabilir.
                                Kullanılan varsayımlar: getiri {formatShare(result.params.annualReturn * 100)}, oynaklık {formatShare(result.params.annualVolatility * 100)},
                                enflasyon {formatShare(result.params.annualInflation * 100)}.
                            </Text>
                        </>
                    )}
                </Stack>
            </div>
        </>
    );
}
