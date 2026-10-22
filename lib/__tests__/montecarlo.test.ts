import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    runMonteCarlo, validateParams, quantileSorted, histogram, createRng, createNormal, type MonteCarloParams,
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
