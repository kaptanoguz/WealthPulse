'use client';

import { useMemo, useState } from 'react';
import {
    Stack, Text, SimpleGrid, Paper, Group, NumberInput, Select, Button, SegmentedControl, Table, Alert, Badge, Tooltip as MTooltip,
} from '@mantine/core';
import { IconPlayerPlay, IconRefresh, IconInfoCircle, IconArrowBackUp } from '@tabler/icons-react';
import {
    ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine,
} from 'recharts';
import {
    AssetType, ASSET_TYPE_LABELS, ClassAssumption, DEFAULT_ASSUMPTIONS, allocationByType, blendAssumptions,
} from '@/lib/portfolio';
import { usePortfolio } from '@/lib/portfolio-store';
import { MonteCarloParams, MonteCarloResult, runMonteCarlo, validateParams, histogram } from '@/lib/montecarlo';
import { formatCurrency, formatCompactTRY } from '@/lib/format';

const cardStyle = { background: 'var(--wp-bg-card)', border: '1px solid var(--wp-border)' };
const tooltipStyle = { background: '#1a2035', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 };

const scenarioPresets = [
    { label: 'Temkinli', return: 20, vol: 15 },
    { label: 'Dengeli', return: 30, vol: 25 },
    { label: 'Agresif', return: 40, vol: 40 },
];

const pct = (v: number) => `%${(v * 100).toFixed(0)}`;
const toPct = (v: number) => Math.round(v * 1000) / 10; // 0.355 → 35.5
const fromPct = (v: number | string) => Number(v) / 100;

export default function SimulatorPage() {
    const { summary } = usePortfolio();
    const allocation = useMemo(() => allocationByType(summary.holdings), [summary.holdings]);
    const hasPortfolio = summary.totalValue > 0;

    const [mode, setMode] = useState<'portfolio' | 'manual'>('portfolio');
    const [initial, setInitial] = useState<number | string>('');
    const [monthly, setMonthly] = useState<number | string>(0);
    const [years, setYears] = useState<number | string>(10);
    const [inflation, setInflation] = useState<number | string>(30);
    const [target, setTarget] = useState<number | string>(0);
    const [simulations, setSimulations] = useState<string | null>('5000');
    const [seed, setSeed] = useState(42);
    const [manualReturn, setManualReturn] = useState<number | string>(30);
    const [manualVol, setManualVol] = useState<number | string>(25);
    const [classAssumptions, setClassAssumptions] = useState<Record<AssetType, ClassAssumption>>(DEFAULT_ASSUMPTIONS);
    const [view, setView] = useState<'real' | 'nominal'>('real');
    const [result, setResult] = useState<MonteCarloResult | null>(null);
    const [running, setRunning] = useState(false);

    const effectiveMode = hasPortfolio ? mode : 'manual';
    // Empty initial field means "use the portfolio value".
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

    const run = (nextSeed = seed) => {
        if (errors.length) return;
        setRunning(true);
        // Let the button show its loading state before the (synchronous) simulation blocks the thread.
        setTimeout(() => {
            setResult(runMonteCarlo({ ...params, seed: nextSeed }));
            setRunning(false);
        }, 20);
    };

    const rows = useMemo(() => (result ? (view === 'real' ? result.real : result.nominal) : []), [result, view]);
    const fanData = useMemo(() => {
        if (!result) return [];
        const { initialValue, monthlyContribution, annualInflation } = result.params;
        const step = result.months > 120 ? 3 : 1;
        let invested = initialValue;
        const out = [];
        for (const r of rows) {
            if (r.month > 0) {
                invested += view === 'real' ? monthlyContribution / Math.pow(1 + annualInflation, r.month / 12) : monthlyContribution;
            }
            if (r.month % step !== 0 && r.month !== result.months) continue;
            out.push({
                year: r.month / 12,
                outer: [r.p10, r.p90] as [number, number],
                inner: [r.p25, r.p75] as [number, number],
                p50: r.p50,
                invested,
            });
        }
        return out;
    }, [result, rows, view]);

    const hist = useMemo(() => {
        if (!result) return [];
        const values = view === 'real' ? result.finalReal : result.finalNominal;
        // Clip the long right tail so the bulk of the distribution stays readable.
        const sorted = Float64Array.from(values).sort();
        const cap = sorted[Math.floor(sorted.length * 0.98)];
        const clipped = sorted.map(v => Math.min(v, cap));
        return histogram(clipped, 24).map(b => ({ label: formatCompactTRY(b.lo), mid: (b.lo + b.hi) / 2, count: b.count }));
    }, [result, view]);

    const final = rows[rows.length - 1];
    const invested = result ? (view === 'real' ? result.totalInvestedReal : result.totalInvested) : 0;

    return (
        <Stack gap="lg">
            <div>
                <Text size="xl" fw={800}>Monte Carlo Simülasyonu</Text>
                <Text size="sm" c="dimmed">Portföyünüzün binlerce olası geleceğini, enflasyondan arındırılmış olarak görün.</Text>
            </div>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <Paper p="lg" radius="md" style={cardStyle}>
                    <Stack gap="sm">
                        <Text fw={700} size="sm" c="dimmed" tt="uppercase" lts={0.5}>Parametreler</Text>
                        <NumberInput
                            label="Başlangıç değeri (₺)"
                            description={hasPortfolio ? (initial === '' ? 'Portföyünüzün güncel değeri kullanılıyor' : undefined) : 'Portföy boş; bir tutar girin'}
                            placeholder={hasPortfolio ? formatCurrency(summary.totalValue) : '500.000'}
                            value={initial}
                            onChange={setInitial}
                            min={0}
                            thousandSeparator="."
                            decimalSeparator=","
                            rightSection={hasPortfolio && initial !== '' ? (
                                <MTooltip label="Portföy değerine dön">
                                    <IconArrowBackUp size={16} style={{ cursor: 'pointer' }} onClick={() => setInitial('')} />
                                </MTooltip>
                            ) : undefined}
                        />
                        <Group grow align="flex-start">
                            <NumberInput label="Aylık ek yatırım (₺)" value={monthly} onChange={setMonthly} min={0} thousandSeparator="." decimalSeparator="," />
                            <NumberInput label="Süre (yıl)" value={years} onChange={setYears} min={1} max={50} allowDecimal={false} />
                        </Group>
                        <Group grow align="flex-start">
                            <NumberInput label="Yıllık enflasyon (%)" value={inflation} onChange={setInflation} min={-20} max={500} decimalScale={1} />
                            <NumberInput label="Hedef (bugünkü ₺)" description="0 = hedef yok" value={target} onChange={setTarget} min={0} thousandSeparator="." decimalSeparator="," />
                        </Group>
                        <Select
                            label="Simülasyon sayısı"
                            data={['1000', '5000', '10000']}
                            value={simulations}
                            onChange={setSimulations}
                            allowDeselect={false}
                        />
                    </Stack>
                </Paper>

                <Paper p="lg" radius="md" style={cardStyle}>
                    <Stack gap="sm">
                        <Group justify="space-between">
                            <Text fw={700} size="sm" c="dimmed" tt="uppercase" lts={0.5}>Getiri varsayımları</Text>
                            <SegmentedControl
                                size="xs"
                                value={effectiveMode}
                                onChange={v => setMode(v as 'portfolio' | 'manual')}
                                data={[
                                    { value: 'portfolio', label: 'Portföyümden', disabled: !hasPortfolio },
                                    { value: 'manual', label: 'Manuel' },
                                ]}
                            />
                        </Group>

                        {effectiveMode === 'portfolio' ? (
                            <>
                                <Table styles={{ td: { padding: '4px 6px', fontSize: 13 }, th: { padding: '4px 6px', fontSize: 11, color: '#64748b' } }}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Sınıf</Table.Th>
                                            <Table.Th style={{ textAlign: 'right' }}>Ağırlık</Table.Th>
                                            <Table.Th style={{ width: 110 }}>Getiri %</Table.Th>
                                            <Table.Th style={{ width: 110 }}>Volatilite %</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {allocation.map(a => (
                                            <Table.Tr key={a.type}>
                                                <Table.Td>{ASSET_TYPE_LABELS[a.type]}</Table.Td>
                                                <Table.Td style={{ textAlign: 'right' }}>%{a.weight.toFixed(1)}</Table.Td>
                                                <Table.Td>
                                                    <NumberInput size="xs" value={toPct(classAssumptions[a.type].annualReturn)} decimalScale={1} min={-50} max={300}
                                                        onChange={v => setClassAssumptions(c => ({ ...c, [a.type]: { ...c[a.type], annualReturn: fromPct(v) } }))} />
                                                </Table.Td>
                                                <Table.Td>
                                                    <NumberInput size="xs" value={toPct(classAssumptions[a.type].annualVolatility)} decimalScale={1} min={0} max={300}
                                                        onChange={v => setClassAssumptions(c => ({ ...c, [a.type]: { ...c[a.type], annualVolatility: fromPct(v) } }))} />
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                                {blended && (
                                    <Group gap="xs">
                                        <Badge variant="light" size="lg">Portföy getirisi {pct(blended.annualReturn)}</Badge>
                                        <Badge variant="light" color="grape" size="lg">Volatilite {pct(blended.annualVolatility)}</Badge>
                                        <Button variant="subtle" size="compact-xs" onClick={() => setClassAssumptions(DEFAULT_ASSUMPTIONS)}>Varsayılanlar</Button>
                                    </Group>
                                )}
                                <Text size="xs" c="dimmed">
                                    TL bazında, yıllık nominal varsayımlar. Varlık sınıfları arasındaki korelasyon hesaba katılır
                                    (çeşitlendirme toplam volatiliteyi düşürür). Bunlar tahmin değil, sizin değiştirebileceğiniz varsayımlardır.
                                </Text>
                            </>
                        ) : (
                            <>
                                <Group grow>
                                    <NumberInput label="Beklenen yıllık getiri (%)" value={manualReturn} onChange={setManualReturn} min={-50} max={300} decimalScale={1} />
                                    <NumberInput label="Yıllık volatilite (%)" value={manualVol} onChange={setManualVol} min={0} max={300} decimalScale={1} />
                                </Group>
                                <Group gap="xs">
                                    {scenarioPresets.map(p => (
                                        <Button key={p.label} variant="default" size="xs" onClick={() => { setManualReturn(p.return); setManualVol(p.vol); }}>
                                            {p.label} · %{p.return} / %{p.vol}
                                        </Button>
                                    ))}
                                </Group>
                            </>
                        )}

                        {errors.length > 0 && (
                            <Alert color="red" variant="light" p="xs">{errors.join(' ')}</Alert>
                        )}
                        <Group grow mt="xs">
                            <Button
                                leftSection={<IconPlayerPlay size={18} />}
                                onClick={() => run()}
                                loading={running}
                                disabled={errors.length > 0}
                            >
                                Simülasyonu çalıştır
                            </Button>
                            {result && (
                                <Button variant="default" leftSection={<IconRefresh size={16} />} disabled={errors.length > 0 || running}
                                    onClick={() => { const s = seed + 1; setSeed(s); run(s); }}>
                                    Yeni örneklem
                                </Button>
                            )}
                        </Group>
                    </Stack>
                </Paper>
            </SimpleGrid>

            {result && final && (
                <>
                    <Group justify="space-between">
                        <Text fw={700}>{result.params.years} yıl sonra</Text>
                        <SegmentedControl
                            size="xs"
                            value={view}
                            onChange={v => setView(v as 'real' | 'nominal')}
                            data={[{ value: 'real', label: 'Bugünkü ₺ (reel)' }, { value: 'nominal', label: 'Nominal ₺' }]}
                        />
                    </Group>

                    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
                        <div className="kpi-card">
                            <div className="kpi-label">Kötü senaryo (P10)</div>
                            <div className="kpi-value" style={{ fontSize: 22, color: '#ef4444' }}>{formatCurrency(final.p10)}</div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-label">Medyan (P50)</div>
                            <div className="kpi-value" style={{ fontSize: 22, color: '#3b82f6' }}>{formatCurrency(final.p50)}</div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-label">İyi senaryo (P90)</div>
                            <div className="kpi-value" style={{ fontSize: 22, color: '#22c55e' }}>{formatCurrency(final.p90)}</div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-label">Toplam yatırılan</div>
                            <div className="kpi-value" style={{ fontSize: 22 }}>{formatCurrency(invested)}</div>
                        </div>
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
                        <Paper p="md" radius="md" style={cardStyle}>
                            <Text size="xs" c="dimmed">Enflasyonun gerisinde kalma olasılığı</Text>
                            <Text fw={800} size="xl" c={result.probRealLoss > 0.3 ? 'red' : 'inherit'}>%{(result.probRealLoss * 100).toFixed(1)}</Text>
                        </Paper>
                        <Paper p="md" radius="md" style={cardStyle}>
                            <Text size="xs" c="dimmed">Nominal zarar olasılığı</Text>
                            <Text fw={800} size="xl">%{(result.probNominalLoss * 100).toFixed(1)}</Text>
                        </Paper>
                        <Paper p="md" radius="md" style={cardStyle}>
                            <Text size="xs" c="dimmed">Hedefe ulaşma olasılığı</Text>
                            <Text fw={800} size="xl" c="green">
                                {result.probTarget === null ? '—' : `%${(result.probTarget * 100).toFixed(1)}`}
                            </Text>
                        </Paper>
                        <Paper p="md" radius="md" style={cardStyle}>
                            <Text size="xs" c="dimmed">Tipik en büyük düşüş (medyan)</Text>
                            <Text fw={800} size="xl" c="orange">−%{(result.medianMaxDrawdown * 100).toFixed(1)}</Text>
                        </Paper>
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
                        <div className="chart-card">
                            <h3>📈 Olası değer aralığı ({view === 'real' ? 'bugünkü ₺' : 'nominal ₺'})</h3>
                            <ResponsiveContainer width="100%" height={320}>
                                <ComposedChart data={fanData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="year" type="number" domain={[0, result.params.years]} stroke="#64748b" fontSize={11}
                                        tickFormatter={v => `${v}y`} allowDecimals={false} />
                                    <YAxis stroke="#64748b" fontSize={11} tickFormatter={formatCompactTRY} width={70} />
                                    <Tooltip
                                        contentStyle={tooltipStyle}
                                        labelFormatter={v => `${Number(v).toFixed(1)}. yıl`}
                                        formatter={(v, name) => {
                                            const label = name === 'outer' ? 'P10 – P90' : name === 'inner' ? 'P25 – P75' : name === 'p50' ? 'Medyan' : 'Yatırılan';
                                            const text = Array.isArray(v) ? `${formatCurrency(Number(v[0]))} – ${formatCurrency(Number(v[1]))}` : formatCurrency(Number(v));
                                            return [text, label];
                                        }}
                                    />
                                    <Area dataKey="outer" stroke="none" fill="#3b82f6" fillOpacity={0.15} isAnimationActive={false} />
                                    <Area dataKey="inner" stroke="none" fill="#3b82f6" fillOpacity={0.3} isAnimationActive={false} />
                                    <Line dataKey="p50" stroke="#3b82f6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                                    <Line dataKey="invested" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="chart-card">
                            <h3>📊 Sonuç dağılımı ({result.params.simulations.toLocaleString('tr-TR')} senaryo)</h3>
                            <ResponsiveContainer width="100%" height={320}>
                                <BarChart data={hist}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="label" stroke="#64748b" fontSize={10} angle={-30} textAnchor="end" height={50} interval={2} />
                                    <YAxis stroke="#64748b" fontSize={11} />
                                    <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v} senaryo`, 'Adet']} labelFormatter={l => `≈ ${l}`} />
                                    <ReferenceLine x={hist.reduce((best, b) => (Math.abs(b.mid - invested) < Math.abs(best.mid - invested) ? b : best), hist[0])?.label}
                                        stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'yatırılan', fill: '#94a3b8', fontSize: 10, position: 'top' }} />
                                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                                </BarChart>
                            </ResponsiveContainer>
                            <Text size="xs" c="dimmed">En yüksek %2&apos;lik dilim son sütunda toplanmıştır.</Text>
                        </div>
                    </SimpleGrid>

                    <Alert variant="light" color="gray" icon={<IconInfoCircle size={16} />}>
                        <Text size="xs">
                            Model: aylık log-normal getiriler (geometrik Brown hareketi), sabit getiri/volatilite/enflasyon varsayımı,
                            katkılar ay sonunda eklenir. Gerçek piyasalarda kalın kuyruklar, rejim değişiklikleri ve kur şokları
                            bu modelden daha sert olabilir. Kullanılan varsayımlar: getiri {pct(result.params.annualReturn)},
                            volatilite {pct(result.params.annualVolatility)}, enflasyon {pct(result.params.annualInflation)}.
                        </Text>
                    </Alert>
                </>
            )}
        </Stack>
    );
}
