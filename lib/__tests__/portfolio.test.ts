import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    type Trade, type FxRates, type Quote, summarizePortfolio, validateTrade, blendAssumptions, allocationByType,
    DEFAULT_ASSUMPTIONS, yahooSymbol, holdingKey,
} from '../portfolio.ts';

let n = 0;
const trade = (t: Partial<Trade>): Trade => ({
    id: `t${n++}`, date: '2026-01-01', side: 'buy', type: 'stock', symbol: 'THYAO', name: 'THY',
    quantity: 10, price: 100, currency: 'TRY', fxRate: 1, fee: 0, ...t,
});
const fx: FxRates = { TRY: 1, USD: 40, EUR: 45 };
const quote = (price: number, currency: Quote['currency'] = 'TRY', changePercent = 0): Quote =>
    ({ price, currency, changePercent, asOf: '2026-01-02T00:00:00Z', source: 'live' });

test('weighted average cost across buys, fees included', () => {
    const trades = [trade({ quantity: 10, price: 100, fee: 10 }), trade({ quantity: 10, price: 200, date: '2026-01-05' })];
    const s = summarizePortfolio(trades, { [holdingKey('stock', 'THYAO')]: quote(180) }, fx);
    const h = s.holdings[0];
    assert.equal(h.quantity, 20);
    assert.equal(h.costBasis, 3010);
    assert.equal(h.avgCost, 150.5);
    assert.equal(h.marketValue, 3600);
    assert.equal(s.unrealizedPnl, 590);
});

test('sell realizes P&L at average cost and reduces basis', () => {
    const trades = [
        trade({ quantity: 10, price: 100 }),
        trade({ quantity: 10, price: 200, date: '2026-01-02' }),
        trade({ side: 'sell', quantity: 5, price: 300, fee: 15, date: '2026-01-03' }),
    ];
    const s = summarizePortfolio(trades, { 'stock:THYAO': quote(300) }, fx);
    const h = s.holdings[0];
    assert.equal(h.quantity, 15);
    assert.equal(h.costBasis, 2250);
    assert.equal(s.realizedPnl, 5 * 300 - 15 - 5 * 150);
});

test('fully sold positions move to closed but keep realized P&L', () => {
    const trades = [trade({}), trade({ side: 'sell', quantity: 10, price: 120, date: '2026-02-01' })];
    const s = summarizePortfolio(trades, {}, fx);
    assert.equal(s.holdings.length, 0);
    assert.equal(s.closed.length, 1);
    assert.equal(s.realizedPnl, 200);
    assert.equal(s.totalValue, 0);
    assert.equal(s.unrealizedPnlPct, null);
});

test('USD assets: cost at trade-date FX, value at current FX', () => {
    const trades = [trade({ type: 'crypto', symbol: 'BTC', currency: 'USD', quantity: 1, price: 100, fxRate: 30 })];
    const s = summarizePortfolio(trades, { 'crypto:BTC': quote(100, 'USD') }, fx);
    assert.equal(s.totalCost, 3000);
    assert.equal(s.totalValue, 4000); // price flat in USD, lira weakened 30 → 40
    assert.equal(s.unrealizedPnl, 1000);
});

test('missing quote values the holding at cost and is reported', () => {
    const s = summarizePortfolio([trade({})], {}, fx);
    assert.equal(s.totalValue, 1000);
    assert.equal(s.unpricedCount, 1);
    assert.equal(s.holdings[0].quote, null);
    // USD quote without an FX rate is unusable too.
    const s2 = summarizePortfolio([trade({ type: 'etf', symbol: 'SPY', currency: 'USD', fxRate: 40 })], { 'etf:SPY': quote(5, 'USD') }, { TRY: 1, USD: 0, EUR: 0 });
    assert.equal(s2.unpricedCount, 1);
});

test('day change and weights', () => {
    const trades = [trade({}), trade({ type: 'gold', symbol: 'gram-altin', quantity: 1, price: 1000 })];
    const s = summarizePortfolio(trades, { 'stock:THYAO': quote(110, 'TRY', 10), 'gold:GRAM-ALTIN': quote(1100) }, fx);
    assert.ok(Math.abs(s.dayChange - 100) < 1e-9);
    assert.ok(Math.abs(s.holdings.reduce((x, h) => x + h.weight, 0) - 100) < 1e-9);
    const alloc = allocationByType(s.holdings);
    assert.equal(alloc.length, 2);
});

test('validation: cannot oversell, including selling before buying', () => {
    const existing = [trade({ quantity: 10, date: '2026-01-10' })];
    const sell = { ...trade({ side: 'sell', quantity: 5 }) };
    assert.ok(validateTrade({ ...sell, date: '2026-01-05' }, existing).length > 0);
    assert.equal(validateTrade({ ...sell, date: '2026-01-15' }, existing).length, 0);
    assert.ok(validateTrade({ ...sell, quantity: 11, date: '2026-01-15' }, existing).length > 0);
    // A back-dated sell that breaks a later sell is rejected.
    const withSell = [...existing, trade({ side: 'sell', quantity: 8, date: '2026-01-20' })];
    assert.ok(validateTrade({ ...sell, quantity: 5, date: '2026-01-15' }, withSell).length > 0);
    assert.ok(validateTrade({ ...sell, price: 0 }, existing).length > 0);
});

test('blendAssumptions', () => {
    assert.equal(blendAssumptions({}), null);
    const single = blendAssumptions({ gold: 1 })!;
    assert.deepEqual(single, DEFAULT_ASSUMPTIONS.gold);
    const mix = blendAssumptions({ stock: 50, gold: 50 })!;
    assert.ok(Math.abs(mix.annualReturn - (DEFAULT_ASSUMPTIONS.stock.annualReturn + DEFAULT_ASSUMPTIONS.gold.annualReturn) / 2) < 1e-12);
    // Diversification: blended vol below the weighted average vol.
    assert.ok(mix.annualVolatility < (DEFAULT_ASSUMPTIONS.stock.annualVolatility + DEFAULT_ASSUMPTIONS.gold.annualVolatility) / 2);
});

test('yahooSymbol', () => {
    assert.equal(yahooSymbol('thyao', 'TRY'), 'THYAO.IS');
    assert.equal(yahooSymbol('AAPL', 'USD'), 'AAPL');
    assert.equal(yahooSymbol('YAY.IS', 'TRY'), 'YAY.IS');
});
