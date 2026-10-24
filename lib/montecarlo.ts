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

const MULBERRY_STEP = 0x6d2b79f5;

/** mulberry32 output for an already advanced state; returns [0, 1). */
function mulberryOut(state: number): number {
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** mulberry32 — small, fast, good enough for simulation; returns [0, 1). */
export function createRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + MULBERRY_STEP) >>> 0;
        return mulberryOut(a);
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

/**
 * Moves the k-th smallest element of a[lo..hi] to index k, with everything
 * before it <= a[k] and everything after it >= a[k]. Floyd–Rivest selection
 * (as in the `quickselect` package): it first narrows the range around k on a
 * small sample, so a single selection costs about 1.5 n comparisons, against
 * O(n log n) for a full sort.
 */
export function selectInPlace(a: Float64Array, k: number, lo = 0, hi = a.length - 1): void {
    while (hi > lo) {
        if (hi - lo > 600) {
            const n = hi - lo + 1;
            const m = k - lo + 1;
            const z = Math.log(n);
            const s = 0.5 * Math.exp((2 * z) / 3);
            const sd = 0.5 * Math.sqrt((z * s * (n - s)) / n) * (m - n / 2 < 0 ? -1 : 1);
            selectInPlace(a, k, Math.max(lo, Math.floor(k - (m * s) / n + sd)), Math.min(hi, Math.floor(k + ((n - m) * s) / n + sd)));
        }
        const t = a[k];
        let i = lo;
        let j = hi;
        swap(a, lo, k);
        if (a[hi] > t) swap(a, lo, hi);
        while (i < j) {
            swap(a, i, j);
            i++;
            j--;
            while (a[i] < t) i++;
            while (a[j] > t) j--;
        }
        if (a[lo] === t) swap(a, lo, j);
        else {
            j++;
            swap(a, j, hi);
        }
        if (j <= k) lo = j + 1;
        if (k <= j) hi = j - 1;
    }
}

function swap(a: Float64Array, i: number, j: number): void {
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
}

/**
 * Places every index in ks (ascending) at its sorted position. Selecting the middle index first
 * splits the array, so each half only searches its own side.
 */
function selectMany(a: Float64Array, ks: number[], kLo: number, kHi: number, lo: number, hi: number): void {
    if (kLo > kHi) return;
    const mid = (kLo + kHi) >>> 1;
    const k = ks[mid];
    selectInPlace(a, k, lo, hi);
    selectMany(a, ks, kLo, mid - 1, lo, k - 1);
    selectMany(a, ks, mid + 1, kHi, k + 1, hi);
}

const BANDS = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95] as const;

/**
 * Nominal and real percentile rows for one month. Only the order statistics
 * the bands interpolate between are selected, so the array is never fully
 * sorted; the numbers are identical to quantileSorted on a sorted copy.
 * Reorders `values` in place.
 */
function percentileRows(month: number, values: Float64Array, deflator: number): [PercentileRow, PercentileRow] {
    const n = values.length;
    const positions = BANDS.map(q => (n - 1) * q);
    const needed = [...new Set(positions.flatMap(pos => [Math.floor(pos), Math.ceil(pos)]))].sort((a, b) => a - b);
    selectMany(values, needed, 0, needed.length - 1, 0, n - 1);
    const band = (pos: number, scale: number) => {
        const lo = Math.floor(pos);
        const hi = Math.ceil(pos);
        const a = values[lo] / scale;
        const b = values[hi] / scale;
        return a + (b - a) * (pos - lo);
    };
    const row = (scale: number): PercentileRow => {
        const [p5, p10, p25, p50, p75, p90, p95] = positions.map(pos => band(pos, scale));
        return { month, p5, p10, p25, p50, p75, p90, p95 };
    };
    // Dividing by 1 is exact, so the nominal row matches the undeflated values bit for bit.
    return [row(1), row(deflator)];
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

    // The simulation walks month by month across all paths, keeping one cross-section of
    // balances in memory instead of a (months + 1) x simulations table (96 MB at 50 years and
    // 20 000 paths). Every path still reads its own stretch of the mulberry32 stream: path s
    // uses draws s*months .. (s+1)*months - 1, which is where a path-by-path run would have
    // read them (months = years * 12 is even, so Box–Muller pairs never straddle two paths).
    // mulberry32's state after i draws is just seed + i * 0x6d2b79f5, so each path's start
    // state is computed directly.
    const rngState = new Uint32Array(simulations);
    for (let s = 0; s < simulations; s++) rngState[s] = (seed >>> 0) + Math.imul(s * months, MULBERRY_STEP);
    const spare = new Float64Array(simulations);
    const balance = new Float64Array(simulations).fill(initialValue);
    const peak = new Float64Array(simulations).fill(initialValue);
    const maxDrawdowns = new Float64Array(simulations);
    const scratch = new Float64Array(simulations);

    const nominal: PercentileRow[] = [];
    const real: PercentileRow[] = [];
    const addRows = (m: number) => {
        scratch.set(balance);
        const [nom, re] = percentileRows(m, scratch, deflator[m]);
        nominal.push(nom);
        real.push(re);
    };
    addRows(0);

    for (let m = 1; m <= months; m++) {
        const fresh = m % 2 === 1;
        for (let s = 0; s < simulations; s++) {
            let z: number;
            if (fresh) {
                // Inlined createNormal(createRng(...)): same arithmetic, so the same variates.
                let a = rngState[s];
                let u = 0;
                while (u === 0) {
                    a = (a + MULBERRY_STEP) >>> 0;
                    u = mulberryOut(a);
                }
                a = (a + MULBERRY_STEP) >>> 0;
                const w = mulberryOut(a);
                rngState[s] = a;
                const r = Math.sqrt(-2 * Math.log(u));
                spare[s] = r * Math.sin(2 * Math.PI * w);
                z = r * Math.cos(2 * Math.PI * w);
            } else {
                z = spare[s];
            }
            const v = balance[s] * Math.exp(mu + sigma * z) + monthlyContribution;
            balance[s] = v;
            // Drawdown of the account balance (contributions included), as the user would see it.
            if (v > peak[s]) peak[s] = v;
            else if (peak[s] > 0) maxDrawdowns[s] = Math.max(maxDrawdowns[s], (peak[s] - v) / peak[s]);
        }
        addRows(m);
    }

    const finalNominal = balance;
    const finalReal = finalNominal.map(v => v / deflator[months]);

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
