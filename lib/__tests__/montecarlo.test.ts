import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    runMonteCarlo, validateParams, quantileSorted, histogram, createRng, createNormal, selectInPlace, type MonteCarloParams,
} from '../montecarlo.ts';

const base: MonteCarloParams = {
    initialValue: 100_000,
    monthlyContribution: 0,
    years: 5,
    annualReturn: 0.2,
    annualVolatility: 0.25,
    annualInflation: 0.3,
    simulations: 4000,
    target: 0,
    seed: 42,
};

test('same seed gives identical results, different seed differs', () => {
    const a = runMonteCarlo(base);
    const b = runMonteCarlo(base);
    const c = runMonteCarlo({ ...base, seed: 7 });
    assert.deepEqual(Array.from(a.finalNominal), Array.from(b.finalNominal));
    assert.notDeepEqual(Array.from(a.finalNominal), Array.from(c.finalNominal));
});

test('zero volatility is deterministic compounding with E[1y growth] = 1 + r', () => {
    const r = runMonteCarlo({ ...base, annualVolatility: 0, simulations: 100 });
    const expected = base.initialValue * Math.pow(1 + base.annualReturn, base.years);
    for (const v of r.finalNominal) assert.ok(Math.abs(v - expected) / expected < 1e-9);
    const expectedReal = expected / Math.pow(1 + base.annualInflation, base.years);
    assert.ok(Math.abs(r.real[r.months].p50 - expectedReal) / expectedReal < 1e-9);
});

test('simulated mean matches the expected arithmetic return', () => {
    const r = runMonteCarlo({ ...base, years: 1, simulations: 20000 });
    const expected = base.initialValue * (1 + base.annualReturn);
    // Standard error of the mean is ~0.2 % here; allow 1.5 %.
    assert.ok(Math.abs(r.meanFinalNominal - expected) / expected < 0.015, `mean ${r.meanFinalNominal} vs ${expected}`);
});

test('contributions are added monthly and counted as invested', () => {
    const r = runMonteCarlo({ ...base, initialValue: 0, monthlyContribution: 1000, annualReturn: 0, annualVolatility: 0, simulations: 100 });
    assert.equal(r.totalInvested, 1000 * 60);
    assert.ok(Math.abs(r.finalNominal[0] - 60_000) < 1e-6);
    assert.equal(r.probNominalLoss, 0);
    // Real invested is less than nominal under positive inflation.
    assert.ok(r.totalInvestedReal < r.totalInvested);
});

test('percentile bands are ordered', () => {
    const r = runMonteCarlo(base);
    for (const row of [...r.nominal, ...r.real]) {
        assert.ok(row.p5 <= row.p10 && row.p10 <= row.p25 && row.p25 <= row.p50);
        assert.ok(row.p50 <= row.p75 && row.p75 <= row.p90 && row.p90 <= row.p95);
    }
});

test('probabilities are in range and react to the inputs', () => {
    const low = runMonteCarlo({ ...base, annualReturn: 0.05 });
    const high = runMonteCarlo({ ...base, annualReturn: 0.6 });
    assert.ok(low.probRealLoss > high.probRealLoss);
    const t = runMonteCarlo({ ...base, target: 50_000 });
    const t2 = runMonteCarlo({ ...base, target: 500_000 });
    assert.ok(t.probTarget !== null && t2.probTarget !== null);
    assert.ok(t.probTarget! > t2.probTarget!);
    assert.equal(runMonteCarlo(base).probTarget, null);
    assert.ok(low.medianMaxDrawdown > 0 && low.medianMaxDrawdown < 1);
});

test('validation rejects bad input', () => {
    assert.ok(validateParams({ ...base, years: 0 }).length > 0);
    assert.ok(validateParams({ ...base, simulations: 10 }).length > 0);
    assert.ok(validateParams({ ...base, initialValue: 0, monthlyContribution: 0 }).length > 0);
    assert.ok(validateParams({ ...base, annualVolatility: NaN }).length > 0);
    assert.equal(validateParams(base).length, 0);
    assert.throws(() => runMonteCarlo({ ...base, years: 0 }));
});

test('quantileSorted interpolates', () => {
    assert.equal(quantileSorted([1, 2, 3, 4, 5], 0.5), 3);
    assert.equal(quantileSorted([0, 10], 0.25), 2.5);
    assert.equal(quantileSorted([7], 0.9), 7);
});

test('histogram counts every value, including the max', () => {
    const vals = [0, 1, 2, 3, 10];
    const h = histogram(vals, 5);
    assert.equal(h.reduce((s, b) => s + b.count, 0), vals.length);
    assert.equal(h[h.length - 1].count, 1);
    assert.deepEqual(histogram([5, 5, 5]), [{ lo: 5, hi: 5, count: 3 }]);
});

test('normal generator has ~zero mean and unit variance', () => {
    const n = createNormal(createRng(1));
    let s = 0, s2 = 0;
    const N = 50000;
    for (let i = 0; i < N; i++) { const z = n(); s += z; s2 += z * z; }
    assert.ok(Math.abs(s / N) < 0.02);
    assert.ok(Math.abs(s2 / N - 1) < 0.03);
});

test('selectInPlace puts the k-th smallest value at k and partitions around it', () => {
    const rng = createRng(5);
    for (const n of [1, 2, 7, 601, 5000]) {
        // Include plenty of ties: they are the usual trap for partition loops.
        const src = Float64Array.from({ length: n }, () => Math.floor(rng() * n / 3));
        const sorted = src.slice().sort();
        for (const k of [0, Math.floor(n / 2), n - 1]) {
            const a = src.slice();
            selectInPlace(a, k);
            assert.equal(a[k], sorted[k]);
            for (let i = 0; i < k; i++) assert.ok(a[i] <= a[k]);
            for (let i = k + 1; i < n; i++) assert.ok(a[i] >= a[k]);
        }
    }
});

// The straightforward path-by-path engine the optimised one replaced. The optimised one must
// give the same numbers, bit for bit.
function referenceRun(p: MonteCarloParams) {
    const months = p.years * 12;
    const sigma = p.annualVolatility / Math.sqrt(12);
    const mu = Math.log(1 + p.annualReturn) / 12 - 0.5 * sigma * sigma;
    const monthlyInflation = Math.pow(1 + p.annualInflation, 1 / 12);
    const values = Array.from({ length: months + 1 }, () => new Float64Array(p.simulations));
    const drawdowns = new Float64Array(p.simulations);
    const normal = createNormal(createRng(p.seed));
    for (let s = 0; s < p.simulations; s++) {
        let v = p.initialValue, peak = v, maxDd = 0;
        values[0][s] = v;
        for (let m = 1; m <= months; m++) {
            v = v * Math.exp(mu + sigma * normal()) + p.monthlyContribution;
            values[m][s] = v;
            if (v > peak) peak = v;
            else if (peak > 0) maxDd = Math.max(maxDd, (peak - v) / peak);
        }
        drawdowns[s] = maxDd;
    }
    const qs = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95];
    const row = (m: number, sorted: Float64Array) => {
        const [p5, p10, p25, p50, p75, p90, p95] = qs.map(q => quantileSorted(sorted, q));
        return { month: m, p5, p10, p25, p50, p75, p90, p95 };
    };
    const nominal = [], real = [];
    for (let m = 0; m <= months; m++) {
        const sorted = values[m].slice().sort();
        const d = Math.pow(monthlyInflation, m);
        nominal.push(row(m, sorted));
        real.push(row(m, sorted.map(v => v / d)));
    }
    return { finalNominal: values[months], nominal, real, medianMaxDrawdown: quantileSorted(drawdowns.sort(), 0.5) };
}

test('optimised engine matches the path-by-path reference exactly', () => {
    for (const p of [
        base,
        { ...base, years: 3, annualVolatility: 0, simulations: 101 },
        { ...base, initialValue: 0, monthlyContribution: 500, years: 7, annualReturn: -0.5, annualVolatility: 2.5, simulations: 777, seed: 9 },
    ]) {
        const got = runMonteCarlo(p);
        const want = referenceRun(p);
        assert.deepEqual(Array.from(got.finalNominal), Array.from(want.finalNominal));
        assert.deepEqual(got.nominal, want.nominal);
        assert.deepEqual(got.real, want.real);
        assert.equal(got.medianMaxDrawdown, want.medianMaxDrawdown);
    }
});
