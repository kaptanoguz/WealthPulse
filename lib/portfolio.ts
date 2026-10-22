// ============================================================
// WealthPulse AI — Portfolio core (pure, no UI / no imports)
// ============================================================
//
// The portfolio is a ledger of trades; holdings are always derived from it.
// Cost basis uses the weighted-average-cost method and is tracked in TRY at
// the FX rate of each trade, so currency gains on USD assets show up in P&L.

export type AssetType = 'stock' | 'etf' | 'gold' | 'forex' | 'crypto' | 'fund';
export type Currency = 'TRY' | 'USD' | 'EUR';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
    stock: 'Hisse Senedi',
    etf: 'ETF',
    gold: 'Altın',
    forex: 'Döviz',
    crypto: 'Kripto',
    fund: 'Fon',
};

export const ASSET_TYPES = Object.keys(ASSET_TYPE_LABELS) as AssetType[];

/** Gold instruments, keyed by the Truncgil key used as their portfolio symbol. */
export const GOLD_NAMES: Record<string, string> = {
    'gram-altin': 'Gram Altın',
    'ceyrek-altin': 'Çeyrek Altın',
    'yarim-altin': 'Yarım Altın',
    'tam-altin': 'Tam Altın',
    'cumhuriyet-altini': 'Cumhuriyet Altını',
    '22-ayar-bilezik': '22 Ayar Bilezik',
    'gram-has-altin': '24 Ayar Has Altın',
    'ata-altin': 'Ata Altın',
    'resat-altin': 'Reşat Altın',
    'ons': 'Ons Altın (USD)',
};

/** Currencies priced against TRY via Truncgil. */
export const FOREX_NAMES: Record<string, string> = {
    USD: 'ABD Doları',
    EUR: 'Euro',
    GBP: 'İngiliz Sterlini',
    CHF: 'İsviçre Frangı',
};

/**
 * Yahoo ticker for stock / ETF / fund holdings. A bare TRY-denominated ticker
 * (THYAO) is assumed to be on Borsa İstanbul; anything with a dot is used as-is.
 */
export function yahooSymbol(symbol: string, currency: Currency): string {
    const s = symbol.trim().toUpperCase();
    if (s.includes('.') || s.includes('=')) return s;
    return currency === 'TRY' ? `${s}.IS` : s;
}

export interface Trade {
    id: string;
    /** YYYY-MM-DD */
    date: string;
    side: 'buy' | 'sell';
    type: AssetType;
    /** Ticker as the price source knows it: THYAO, AAPL, BTC, USD, gram-altin … */
    symbol: string;
    name: string;
    quantity: number;
    /** Unit price in `currency`. */
    price: number;
    currency: Currency;
    /** TRY per 1 unit of `currency` on the trade date (1 for TRY). */
    fxRate: number;
    /** Commission in `currency`. */
    fee: number;
}

export interface Quote {
    price: number;
    currency: Currency;
    changePercent: number;
    /** ISO timestamp of when the quote was fetched or entered. */
    asOf: string;
    /** 'manual' = typed in by the user (e.g. TEFAS funds without a feed). */
    source: 'live' | 'manual';
}

/** TRY per 1 unit of currency. */
export type FxRates = Record<Currency, number>;

export interface Holding {
    key: string;
    type: AssetType;
    symbol: string;
    name: string;
    quantity: number;
    currency: Currency;
    /** Remaining cost basis in TRY. */
    costBasis: number;
    /** Average cost per unit in TRY. */
    avgCost: number;
    /** Realized P&L in TRY from sells. */
    realizedPnl: number;
    /** null when no quote is available — the holding is then valued at cost. */
    quote: Quote | null;
    marketValue: number;
    unrealizedPnl: number;
    unrealizedPnlPct: number | null;
    /** TRY change since previous close, 0 if unknown. */
    dayChange: number;
    weight: number;
}

export interface PortfolioSummary {
    holdings: Holding[];
    /** Holdings fully sold — kept for realized P&L. */
    closed: Holding[];
    totalValue: number;
    totalCost: number;
    unrealizedPnl: number;
    unrealizedPnlPct: number | null;
    realizedPnl: number;
    dayChange: number;
    dayChangePct: number | null;
    /** Holdings valued at cost because no quote is available. */
    unpricedCount: number;
}

const EPS = 1e-9;

export function holdingKey(type: AssetType, symbol: string): string {
    return `${type}:${symbol.trim().toUpperCase()}`;
}

export function sortTrades(trades: Trade[]): Trade[] {
    // Stable: same-day trades keep insertion order.
    return trades
        .map((t, i) => ({ t, i }))
        .sort((a, b) => a.t.date.localeCompare(b.t.date) || a.i - b.i)
        .map(x => x.t);
}

/** Quantity held for `key` right before a trade on `date` would be applied. */
export function quantityHeld(trades: Trade[], key: string, date?: string): number {
    let q = 0;
    for (const t of sortTrades(trades)) {
        if (date && t.date > date) break;
        if (holdingKey(t.type, t.symbol) !== key) continue;
        q += t.side === 'buy' ? t.quantity : -t.quantity;
    }
    return q;
}

export function validateTrade(t: Omit<Trade, 'id'>, existing: Trade[]): string[] {
    const errors: string[] = [];
    if (!t.symbol.trim()) errors.push('Sembol gerekli.');
    if (!t.name.trim()) errors.push('Varlık adı gerekli.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date)) errors.push('Geçerli bir tarih girin.');
    if (!(t.quantity > 0)) errors.push('Miktar sıfırdan büyük olmalı.');
    if (!(t.price > 0)) errors.push('Fiyat sıfırdan büyük olmalı.');
    if (!(t.fxRate > 0)) errors.push('Kur sıfırdan büyük olmalı.');
    if (!(t.fee >= 0)) errors.push('Komisyon negatif olamaz.');
    if (t.side === 'sell' && errors.length === 0) {
        // Must hold enough on that date *and* never go negative afterwards.
        const key = holdingKey(t.type, t.symbol);
        const candidate = sortTrades([...existing, { ...t, id: '__candidate__' }]);
        let q = 0;
        for (const x of candidate) {
            if (holdingKey(x.type, x.symbol) !== key) continue;
            q += x.side === 'buy' ? x.quantity : -x.quantity;
            if (q < -EPS) {
                errors.push('Satış miktarı, o tarihte elinizde olan miktardan fazla.');
                break;
            }
        }
    }
    return errors;
}

interface Position {
    type: AssetType;
    symbol: string;
    name: string;
    currency: Currency;
    quantity: number;
    costBasis: number;
    realizedPnl: number;
}

export function buildPositions(trades: Trade[]): Map<string, Position> {
    const positions = new Map<string, Position>();
    for (const t of sortTrades(trades)) {
        const key = holdingKey(t.type, t.symbol);
        let p = positions.get(key);
        if (!p) {
            p = { type: t.type, symbol: t.symbol.trim().toUpperCase(), name: t.name, currency: t.currency, quantity: 0, costBasis: 0, realizedPnl: 0 };
            positions.set(key, p);
        }
        p.name = t.name || p.name;
        p.currency = t.currency;
        const feeTry = t.fee * t.fxRate;
        if (t.side === 'buy') {
            p.quantity += t.quantity;
            p.costBasis += t.quantity * t.price * t.fxRate + feeTry;
        } else {
            // Validation prevents overselling; clamp defensively for corrupted imports.
            const qty = Math.min(t.quantity, p.quantity);
            const avg = p.quantity > EPS ? p.costBasis / p.quantity : 0;
            p.realizedPnl += qty * t.price * t.fxRate - feeTry - qty * avg;
            p.costBasis -= qty * avg;
            p.quantity -= qty;
            if (p.quantity < EPS) {
                p.quantity = 0;
                p.costBasis = 0;
            }
        }
    }
    return positions;
}

export function summarizePortfolio(
    trades: Trade[],
    quotes: Record<string, Quote>,
    fx: FxRates,
): PortfolioSummary {
    const positions = buildPositions(trades);
    const open: Holding[] = [];
    const closed: Holding[] = [];
    let unpricedCount = 0;

    for (const [key, p] of positions) {
        const quote = quotes[key] ?? null;
        const rate = quote ? fx[quote.currency] : NaN;
        const priced = quote !== null && quote.price > 0 && rate > 0;
        if (p.quantity > 0 && !priced) unpricedCount++;

        const marketValue = priced ? p.quantity * quote.price * rate : p.costBasis;
        const unrealizedPnl = marketValue - p.costBasis;
        // Previous close value = value / (1 + pct). FX moves are ignored for the daily figure.
        const dayChange = priced && quote.changePercent > -100
            ? marketValue - marketValue / (1 + quote.changePercent / 100)
            : 0;

        const h: Holding = {
            key,
            type: p.type,
            symbol: p.symbol,
            name: p.name,
            quantity: p.quantity,
            currency: p.currency,
            costBasis: p.costBasis,
            avgCost: p.quantity > 0 ? p.costBasis / p.quantity : 0,
            realizedPnl: p.realizedPnl,
            quote: priced ? quote : null,
            marketValue,
            unrealizedPnl,
            unrealizedPnlPct: p.costBasis > 0 ? (unrealizedPnl / p.costBasis) * 100 : null,
            dayChange,
            weight: 0,
        };
        (p.quantity > 0 ? open : closed).push(h);
    }

    const totalValue = open.reduce((s, h) => s + h.marketValue, 0);
    const totalCost = open.reduce((s, h) => s + h.costBasis, 0);
    const dayChange = open.reduce((s, h) => s + h.dayChange, 0);
    for (const h of open) h.weight = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
    open.sort((a, b) => b.marketValue - a.marketValue);

    const unrealizedPnl = totalValue - totalCost;
    const prevValue = totalValue - dayChange;
    return {
        holdings: open,
        closed,
        totalValue,
        totalCost,
        unrealizedPnl,
        unrealizedPnlPct: totalCost > 0 ? (unrealizedPnl / totalCost) * 100 : null,
        realizedPnl: [...open, ...closed].reduce((s, h) => s + h.realizedPnl, 0),
        dayChange,
        dayChangePct: prevValue > 0 ? (dayChange / prevValue) * 100 : null,
        unpricedCount,
    };
}

export function allocationByType(holdings: Holding[]): { type: AssetType; name: string; value: number; weight: number }[] {
    const total = holdings.reduce((s, h) => s + h.marketValue, 0);
    const byType = new Map<AssetType, number>();
    for (const h of holdings) byType.set(h.type, (byType.get(h.type) ?? 0) + h.marketValue);
    return [...byType.entries()]
        .map(([type, value]) => ({ type, name: ASSET_TYPE_LABELS[type], value, weight: total > 0 ? (value / total) * 100 : 0 }))
        .sort((a, b) => b.value - a.value);
}

// --- Assumptions for the simulator -----------------------------------------

export interface ClassAssumption {
    /** Expected arithmetic annual return in TRY terms, decimal. */
    annualReturn: number;
    /** Annual volatility in TRY terms, decimal. */
    annualVolatility: number;
}

/**
 * Starting assumptions, nominal TRY. These are deliberately round numbers,
 * not forecasts — the simulator lets the user overwrite every one of them.
 */
export const DEFAULT_ASSUMPTIONS: Record<AssetType, ClassAssumption> = {
    stock: { annualReturn: 0.35, annualVolatility: 0.35 },
    etf: { annualReturn: 0.30, annualVolatility: 0.25 },
    gold: { annualReturn: 0.30, annualVolatility: 0.20 },
    forex: { annualReturn: 0.22, annualVolatility: 0.15 },
    crypto: { annualReturn: 0.40, annualVolatility: 0.75 },
    fund: { annualReturn: 0.30, annualVolatility: 0.25 },
};

/** Correlations between asset classes (TRY returns). Symmetric, unit diagonal. */
export const DEFAULT_CORRELATIONS: Record<AssetType, Record<AssetType, number>> = {
    stock: { stock: 1, etf: 0.4, gold: 0.1, forex: 0.1, crypto: 0.3, fund: 0.8 },
    etf: { stock: 0.4, etf: 1, gold: 0.3, forex: 0.6, crypto: 0.4, fund: 0.4 },
    gold: { stock: 0.1, etf: 0.3, gold: 1, forex: 0.6, crypto: 0.2, fund: 0.2 },
    forex: { stock: 0.1, etf: 0.6, gold: 0.6, forex: 1, crypto: 0.3, fund: 0.2 },
    crypto: { stock: 0.3, etf: 0.4, gold: 0.2, forex: 0.3, crypto: 1, fund: 0.3 },
    fund: { stock: 0.8, etf: 0.4, gold: 0.2, forex: 0.2, crypto: 0.3, fund: 1 },
};

/**
 * Collapses per-class assumptions into one portfolio-level return / volatility
 * using current weights: μp = Σ wᵢμᵢ,  σp² = Σᵢ Σⱼ wᵢ wⱼ σᵢ σⱼ ρᵢⱼ.
 */
export function blendAssumptions(
    weights: Partial<Record<AssetType, number>>,
    assumptions: Record<AssetType, ClassAssumption> = DEFAULT_ASSUMPTIONS,
    correlations: Record<AssetType, Record<AssetType, number>> = DEFAULT_CORRELATIONS,
): ClassAssumption | null {
    const types = ASSET_TYPES.filter(t => (weights[t] ?? 0) > 0);
    const total = types.reduce((s, t) => s + (weights[t] ?? 0), 0);
    if (total <= 0) return null;
    const w = (t: AssetType) => (weights[t] ?? 0) / total;

    let annualReturn = 0;
    let variance = 0;
    for (const i of types) {
        annualReturn += w(i) * assumptions[i].annualReturn;
        for (const j of types) {
            variance += w(i) * w(j) * assumptions[i].annualVolatility * assumptions[j].annualVolatility * correlations[i][j];
        }
    }
    return { annualReturn, annualVolatility: Math.sqrt(Math.max(0, variance)) };
}
