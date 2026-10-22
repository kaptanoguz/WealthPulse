// ============================================================
// WealthPulse AI — Monte Carlo engine (pure, no UI / no imports)
// ============================================================
//
// Model: monthly geometric Brownian motion.
//   - annualReturn is the expected *arithmetic* annual return, i.e.
//     E[V(1y) / V(0)] = 1 + annualReturn. The log drift is derived from it so
//     the simulated mean actually matches the number the user typed in.
//   - annualVolatility is the annualised standard deviation of log returns.
//   - Contributions are added at the end of each month (after that month's return).
//   - "Real" values are deflated by a constant annual inflation rate, so they
//     read as "today's lira".

export interface MonteCarloParams {
    initialValue: number;
    /** Added at the end of every month, in nominal TRY. May be 0. */
    monthlyContribution: number;
    years: number;
    /** Decimal, e.g. 0.30 for 30 %. */
    annualReturn: number;
    /** Decimal, e.g. 0.25 for 25 %. */
    annualVolatility: number;
    /** Decimal, e.g. 0.30 for 30 %. Used for the real (inflation-adjusted) view. */
    annualInflation: number;
    simulations: number;
    /** Target in today's purchasing power (real TRY). 0 disables the target probability. */
    target: number;
    /** Same seed + same params => identical result. */
    seed: number;
}

export interface PercentileRow {
    month: number;
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
}

export interface MonteCarloResult {
    params: MonteCarloParams;
    months: number;
    nominal: PercentileRow[];
    real: PercentileRow[];
    finalNominal: Float64Array;
    finalReal: Float64Array;
    /** Sum of initial value + all contributions, nominal. */
    totalInvested: number;
    /** Same, but each contribution deflated to today's lira. */
    totalInvestedReal: number;
    meanFinalNominal: number;
    meanFinalReal: number;
    /** P(final nominal value < total nominal money put in). */
    probNominalLoss: number;
    /** P(final real value < real money put in) — i.e. did not beat inflation. */
    probRealLoss: number;
    /** P(final real value >= target). null when no target was given. */
    probTarget: number | null;
    /** Median over paths of the worst peak-to-trough fall (decimal, 0..1). */
    medianMaxDrawdown: number;
}

export const MC_LIMITS = {
    years: { min: 1, max: 50 },
    simulations: { min: 100, max: 20000 },
    annualReturn: { min: -0.9, max: 5 },
    annualVolatility: { min: 0, max: 3 },
    annualInflation: { min: -0.5, max: 5 },
} as const;

export function validateParams(p: MonteCarloParams): string[] {
    const errors: string[] = [];
    const finite = (v: number) => Number.isFinite(v);

    if (!finite(p.initialValue) || p.initialValue < 0) errors.push('Başlangıç değeri 0 veya daha büyük olmalı.');
    if (!finite(p.monthlyContribution) || p.monthlyContribution < 0) errors.push('Aylık katkı 0 veya daha büyük olmalı.');
    if (p.initialValue <= 0 && p.monthlyContribution <= 0) errors.push('Başlangıç değeri veya aylık katkıdan en az biri pozitif olmalı.');
    if (!Number.isInteger(p.years) || p.years < MC_LIMITS.years.min || p.years > MC_LIMITS.years.max) {
        errors.push(`Süre ${MC_LIMITS.years.min}–${MC_LIMITS.years.max} yıl arasında tam sayı olmalı.`);
    }
    if (!Number.isInteger(p.simulations) || p.simulations < MC_LIMITS.simulations.min || p.simulations > MC_LIMITS.simulations.max) {
        errors.push(`Simülasyon sayısı ${MC_LIMITS.simulations.min}–${MC_LIMITS.simulations.max} arasında olmalı.`);
    }
    if (!finite(p.annualReturn) || p.annualReturn <= MC_LIMITS.annualReturn.min || p.annualReturn > MC_LIMITS.annualReturn.max) {
        errors.push('Beklenen getiri makul bir aralıkta olmalı (−%90 ile %500 arası).');
    }
    if (!finite(p.annualVolatility) || p.annualVolatility < MC_LIMITS.annualVolatility.min || p.annualVolatility > MC_LIMITS.annualVolatility.max) {
        errors.push('Volatilite %0 ile %300 arasında olmalı.');
    }
    if (!finite(p.annualInflation) || p.annualInflation <= MC_LIMITS.annualInflation.min || p.annualInflation > MC_LIMITS.annualInflation.max) {
        errors.push('Enflasyon makul bir aralıkta olmalı.');
    }
    if (!finite(p.target) || p.target < 0) errors.push('Hedef 0 veya daha büyük olmalı.');
    return errors;
}

// --- Seeded RNG -------------------------------------------------------------

/** mulberry32 — small, fast, good enough for simulation; returns [0, 1). */
export function createRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Standard normal via Box–Muller, caching the second variate. */
export function createNormal(rng: () => number): () => number {
    let spare: number | null = null;
    return () => {
        if (spare !== null) {
            const s = spare;
            spare = null;
            return s;
        }
        let u = 0;
        while (u === 0) u = rng();
        const v = rng();
        const r = Math.sqrt(-2 * Math.log(u));
        spare = r * Math.sin(2 * Math.PI * v);
        return r * Math.cos(2 * Math.PI * v);
    };
}

// --- Statistics helpers -----------------------------------------------------

/** Linear-interpolated quantile of an already ascending-sorted array. */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
    const n = sorted.length;
    if (n === 0) return NaN;
    if (n === 1) return sorted[0];
    const pos = (n - 1) * Math.min(1, Math.max(0, q));
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function percentileRow(month: number, sorted: Float64Array): PercentileRow {
    return {
        month,
        p5: quantileSorted(sorted, 0.05),
        p10: quantileSorted(sorted, 0.10),
        p25: quantileSorted(sorted, 0.25),
        p50: quantileSorted(sorted, 0.50),
        p75: quantileSorted(sorted, 0.75),
        p90: quantileSorted(sorted, 0.90),
        p95: quantileSorted(sorted, 0.95),
    };
}

function mean(values: ArrayLike<number>): number {
    let s = 0;
    for (let i = 0; i < values.length; i++) s += values[i];
    return values.length ? s / values.length : NaN;
}

function share(values: ArrayLike<number>, predicate: (v: number) => boolean): number {
    let c = 0;
    for (let i = 0; i < values.length; i++) if (predicate(values[i])) c++;
    return values.length ? c / values.length : 0;
}

// --- Simulation -------------------------------------------------------------

export function runMonteCarlo(params: MonteCarloParams): MonteCarloResult {
    const errors = validateParams(params);
    if (errors.length) throw new Error(errors.join(' '));

    const { initialValue, monthlyContribution, years, annualReturn, annualVolatility, annualInflation, simulations, target, seed } = params;
    const months = years * 12;

    const sigma = annualVolatility / Math.sqrt(12);
    // E[exp(mu + sigma*Z)] = exp(mu + sigma^2/2); over 12 months this must equal 1 + annualReturn.
    const mu = Math.log(1 + annualReturn) / 12 - 0.5 * sigma * sigma;
    const monthlyInflation = Math.pow(1 + annualInflation, 1 / 12);

    const deflator = new Float64Array(months + 1);
    for (let m = 0; m <= months; m++) deflator[m] = Math.pow(monthlyInflation, m);

    // values[m][s]: month-major so each month can be sorted independently.
    const values: Float64Array[] = Array.from({ length: months + 1 }, () => new Float64Array(simulations));
    const maxDrawdowns = new Float64Array(simulations);

    const normal = createNormal(createRng(seed));

    for (let s = 0; s < simulations; s++) {
        let v = initialValue;
        let peak = v;
        let maxDd = 0;
        values[0][s] = v;
        for (let m = 1; m <= months; m++) {
            v = v * Math.exp(mu + sigma * normal()) + monthlyContribution;
            values[m][s] = v;
            // Drawdown of the account balance (contributions included), as the user would see it.
            if (v > peak) peak = v;
            else if (peak > 0) maxDd = Math.max(maxDd, (peak - v) / peak);
        }
        maxDrawdowns[s] = maxDd;
    }

    const finalNominal = Float64Array.from(values[months]);
    const finalReal = finalNominal.map(v => v / deflator[months]);

    const nominal: PercentileRow[] = [];
    const real: PercentileRow[] = [];
    for (let m = 0; m <= months; m++) {
        const sorted = values[m].slice().sort();
        nominal.push(percentileRow(m, sorted));
        real.push(percentileRow(m, sorted.map(v => v / deflator[m])));
    }

    let totalInvestedReal = initialValue;
    for (let m = 1; m <= months; m++) totalInvestedReal += monthlyContribution / deflator[m];
    const totalInvested = initialValue + monthlyContribution * months;

    return {
        params,
        months,
        nominal,
        real,
        finalNominal,
        finalReal,
        totalInvested,
        totalInvestedReal,
        meanFinalNominal: mean(finalNominal),
        meanFinalReal: mean(finalReal),
        probNominalLoss: share(finalNominal, v => v < totalInvested),
        probRealLoss: share(finalReal, v => v < totalInvestedReal),
        probTarget: target > 0 ? share(finalReal, v => v >= target) : null,
        medianMaxDrawdown: quantileSorted(maxDrawdowns.slice().sort(), 0.5),
    };
}

/** Equal-width histogram that includes the maximum value in the last bucket. */
export function histogram(values: ArrayLike<number>, buckets = 20): { lo: number; hi: number; count: number }[] {
    if (values.length === 0) return [];
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < values.length; i++) {
        if (values[i] < min) min = values[i];
        if (values[i] > max) max = values[i];
    }
    if (min === max) return [{ lo: min, hi: max, count: values.length }];
    const step = (max - min) / buckets;
    const bins = Array.from({ length: buckets }, (_, i) => ({ lo: min + i * step, hi: min + (i + 1) * step, count: 0 }));
    for (let i = 0; i < values.length; i++) {
        const idx = Math.min(buckets - 1, Math.floor((values[i] - min) / step));
        bins[idx].count++;
    }
    return bins;
}
