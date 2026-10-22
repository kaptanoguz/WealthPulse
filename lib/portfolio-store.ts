'use client';

// ============================================================
// WealthPulse AI — Portfolio store (localStorage, shared across pages)
// ============================================================

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
    Trade, Quote, FxRates, AssetType, Currency, ASSET_TYPES,
    holdingKey, buildPositions, summarizePortfolio, validateTrade,
} from '@/lib/portfolio';

export interface Snapshot {
    /** YYYY-MM-DD, one per day (last refresh of the day wins). */
    date: string;
    value: number;
    cost: number;
}

export interface PortfolioState {
    version: 1;
    trades: Trade[];
    quotes: Record<string, Quote>;
    fx: FxRates;
    quotesUpdatedAt: string | null;
    snapshots: Snapshot[];
}

const STORAGE_KEY = 'wealthpulse.portfolio.v1';
const MAX_SNAPSHOTS = 3650;
const REFRESH_MS = 120_000;

const EMPTY: PortfolioState = {
    version: 1,
    trades: [],
    quotes: {},
    fx: { TRY: 1, USD: 0, EUR: 0 },
    quotesUpdatedAt: null,
    snapshots: [],
};

// --- (De)serialisation with defensive validation ---------------------------

const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR'];
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function parseTrade(raw: unknown): Trade | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const t: Trade = {
        id: str(r.id) || newId(),
        date: str(r.date),
        side: r.side === 'sell' ? 'sell' : 'buy',
        type: ASSET_TYPES.includes(r.type as AssetType) ? (r.type as AssetType) : 'stock',
        symbol: str(r.symbol),
        name: str(r.name),
        quantity: num(r.quantity),
        price: num(r.price),
        currency: CURRENCIES.includes(r.currency as Currency) ? (r.currency as Currency) : 'TRY',
        fxRate: num(r.fxRate, 1),
        fee: num(r.fee),
    };
    return /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.symbol && t.quantity > 0 && t.price > 0 && t.fxRate > 0 ? t : null;
}

export function parseState(raw: unknown): PortfolioState | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!Array.isArray(r.trades)) return null;
    const trades = r.trades.map(parseTrade).filter((t): t is Trade => t !== null);

    const quotes: Record<string, Quote> = {};
    if (r.quotes && typeof r.quotes === 'object') {
        for (const [k, q] of Object.entries(r.quotes as Record<string, Record<string, unknown>>)) {
            if (!q || num(q.price) <= 0) continue;
            quotes[k] = {
                price: num(q.price),
                currency: CURRENCIES.includes(q.currency as Currency) ? (q.currency as Currency) : 'TRY',
                changePercent: num(q.changePercent),
                asOf: str(q.asOf),
                source: q.source === 'manual' ? 'manual' : 'live',
            };
        }
    }
    const fxRaw = (r.fx ?? {}) as Record<string, unknown>;
    const snapshots = Array.isArray(r.snapshots)
        ? (r.snapshots as Record<string, unknown>[])
            .filter(s => s && /^\d{4}-\d{2}-\d{2}$/.test(str(s.date)))
            .map(s => ({ date: str(s.date), value: num(s.value), cost: num(s.cost) }))
        : [];

    return {
        version: 1,
        trades,
        quotes,
        fx: { TRY: 1, USD: num(fxRaw.USD), EUR: num(fxRaw.EUR) },
        quotesUpdatedAt: str(r.quotesUpdatedAt) || null,
        snapshots,
    };
}

// --- Module-level store ----------------------------------------------------

let state: PortfolioState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
    if (loaded || typeof window === 'undefined') return;
    loaded = true;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) state = parseState(JSON.parse(raw)) ?? EMPTY;
    } catch {
        state = EMPTY;
    }
}

function setState(updater: (s: PortfolioState) => PortfolioState) {
    load();
    state = updater(state);
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Storage full or blocked: keep working in memory.
    }
    listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
        if (e.key !== STORAGE_KEY) return;
        loaded = false;
        load();
        listener();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', onStorage);
    };
}

function getSnapshot() {
    load();
    return state;
}

const getServerSnapshot = () => EMPTY;

export function newId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function withSnapshot(s: PortfolioState): PortfolioState {
    const summary = summarizePortfolio(s.trades, s.quotes, s.fx);
    if (summary.holdings.length === 0) return s;
    const snap: Snapshot = { date: today(), value: summary.totalValue, cost: summary.totalCost };
    const rest = s.snapshots.filter(x => x.date !== snap.date);
    return { ...s, snapshots: [...rest, snap].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_SNAPSHOTS) };
}

// --- Actions ---------------------------------------------------------------

export const portfolioActions = {
    /** Returns validation errors; empty array means the trade was saved. */
    addTrade(input: Omit<Trade, 'id'>): string[] {
        const current = getSnapshot();
        const errors = validateTrade(input, current.trades);
        if (errors.length) return errors;
        setState(s => ({ ...s, trades: [...s.trades, { ...input, symbol: input.symbol.trim().toUpperCase(), id: newId() }] }));
        return [];
    },

    /** Deleting a buy could make a later sell invalid; refuse in that case. */
    deleteTrade(id: string): string[] {
        const current = getSnapshot();
        const remaining = current.trades.filter(t => t.id !== id);
        const removed = current.trades.find(t => t.id === id);
        if (!removed) return [];
        if (removed.side === 'buy') {
            const sells = remaining.filter(t => t.side === 'sell' && holdingKey(t.type, t.symbol) === holdingKey(removed.type, removed.symbol));
            for (const sell of sells) {
                const others = remaining.filter(t => t.id !== sell.id);
                if (validateTrade(sell, others).length) {
                    return ['Bu alımı silerseniz sonraki bir satış elinizde olmayan miktarı satmış olur. Önce ilgili satışı silin.'];
                }
            }
        }
        setState(s => ({ ...s, trades: remaining }));
        return [];
    },

    setManualPrice(type: AssetType, symbol: string, price: number, currency: Currency) {
        if (!(price > 0)) return;
        setState(s => withSnapshot({
            ...s,
            quotes: { ...s.quotes, [holdingKey(type, symbol)]: { price, currency, changePercent: 0, asOf: new Date().toISOString(), source: 'manual' } },
        }));
    },

    applyQuotes(quotes: Record<string, Quote>, fx: Partial<FxRates>, updatedAt: string) {
        setState(s => withSnapshot({
            ...s,
            // Live quotes replace older ones; keys without a fresh quote keep the last known (possibly manual) price.
            quotes: { ...s.quotes, ...quotes },
            fx: {
                TRY: 1,
                USD: fx.USD && fx.USD > 0 ? fx.USD : s.fx.USD,
                EUR: fx.EUR && fx.EUR > 0 ? fx.EUR : s.fx.EUR,
            },
            // Only claim "prices as of …" when something was actually priced.
            quotesUpdatedAt: Object.keys(quotes).length > 0 ? updatedAt : s.quotesUpdatedAt,
        }));
    },

    exportJson(): string {
        return JSON.stringify(getSnapshot(), null, 2);
    },

    /** Replaces everything. Returns an error message or null. */
    importJson(text: string): string | null {
        let parsed: PortfolioState | null = null;
        try {
            parsed = parseState(JSON.parse(text));
        } catch {
            return 'Dosya okunamadı: geçerli bir JSON değil.';
        }
        if (!parsed) return 'Dosya bir WealthPulse yedeği gibi görünmüyor.';
        setState(() => parsed);
        return null;
    },

    clear() {
        setState(() => EMPTY);
    },
};

// --- Hooks -----------------------------------------------------------------

export function usePortfolioState(): PortfolioState {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function usePortfolio() {
    const s = usePortfolioState();
    const summary = useMemo(() => summarizePortfolio(s.trades, s.quotes, s.fx), [s.trades, s.quotes, s.fx]);
    return { state: s, summary };
}

/**
 * Fetches live prices for every open holding on mount and every 2 minutes.
 * Last known prices stay in storage, so the app still works offline.
 */
export function usePriceRefresh() {
    const s = usePortfolioState();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [missing, setMissing] = useState<string[]>([]);

    const items = useMemo(() => {
        const out: { type: AssetType; symbol: string; currency: Currency }[] = [];
        for (const p of buildPositions(s.trades).values()) {
            if (p.quantity > 0) out.push({ type: p.type, symbol: p.symbol, currency: p.currency });
        }
        return out;
    }, [s.trades]);
    const itemsKey = JSON.stringify(items);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/prices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: JSON.parse(itemsKey) }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const quotes = json.quotes ?? {};
            const missingKeys: string[] = Array.isArray(json.missing) ? json.missing : [];
            portfolioActions.applyQuotes(quotes, json.fx ?? {}, json.updatedAt ?? new Date().toISOString());
            setMissing(missingKeys);
            if (missingKeys.length > 0 && Object.keys(quotes).length === 0) {
                setError('Fiyat kaynaklarına ulaşılamadı; son bilinen fiyatlar gösteriliyor.');
            }
        } catch {
            setError('Canlı fiyatlar alınamadı; son bilinen fiyatlar gösteriliyor.');
        } finally {
            setLoading(false);
        }
    }, [itemsKey]);

    useEffect(() => {
        void refresh();
        const id = setInterval(refresh, REFRESH_MS);
        return () => clearInterval(id);
    }, [refresh]);

    return { refresh, loading, error, missing, updatedAt: s.quotesUpdatedAt };
}

const noopSubscribe = () => () => {};

/** false during SSR / hydration, true once localStorage has been read on the client. */
export function useStoreReady(): boolean {
    return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
