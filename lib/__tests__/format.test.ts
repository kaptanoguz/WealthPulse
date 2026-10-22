import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatCurrency, formatSignedCurrency, formatPercent, formatShare, formatProbability, formatCurrency0,
} from '../format.ts';

// Intl output uses narrow no-break spaces in some locales; normalise for comparison.
const n = (s: string) => s.replace(/\s/g, ' ');

test('Turkish currency and percent formatting', () => {
    assert.equal(n(formatCurrency(691155)), '₺691.155,00');
    assert.equal(n(formatCurrency(0.41)), '₺0,4100');
    assert.equal(n(formatCurrency0(691155.4)), '₺691.155');
    assert.equal(n(formatSignedCurrency(39175)), '+₺39.175,00');
    assert.equal(n(formatSignedCurrency(-2321.04)), '-₺2.321,04');
    assert.equal(formatPercent(2.86), '+%2,86');
    assert.equal(formatPercent(-0.33), '-%0,33');
    assert.equal(formatPercent(0), '%0,00');
    assert.equal(formatShare(36.8), '%36,8');
    assert.equal(formatProbability(0.59), '%59,0');
});
