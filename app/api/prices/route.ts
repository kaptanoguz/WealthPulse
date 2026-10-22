import { NextResponse } from 'next/server';
import {
    fetchTruncgilToday, fetchYahooQuotes, fetchCoinGeckoUsd, COINGECKO_IDS,
} from '@/lib/market-sources';
import {
    AssetType, Currency, FxRates, Quote, ASSET_TYPES, holdingKey, yahooSymbol,
} from '@/lib/portfolio';

/**
 * Portföydeki varlıkların güncel fiyatları + TRY kurları.
 *
 * POST { items: [{ type, symbol, currency }] }
 * → { quotes: { "<type>:<SYMBOL>": Quote }, fx: { TRY, USD, EUR }, missing: string[] }
 *
 * Altın ve döviz pozisyonları "Alış" (kuyumcunun / bankanın size ödeyeceği) fiyatla
 * değerlenir; bu, portföyü bugün nakde çevirseniz alacağınız tutara en yakın değerdir.
 */

interface PriceRequestItem {
    type: AssetType;
    symbol: string;
    currency: Currency;
}

const MAX_ITEMS = 200;
const TROY_OUNCE_GRAMS = 31.1034768;
/** Gold instruments that can be priced from the ounce when Truncgil is unavailable (grams of fine gold). */
const GOLD_FALLBACK_GRAMS: Record<string, number> = {
    'ons': TROY_OUNCE_GRAMS,
    'gram-has-altin': 1,
    'gram-altin': 0.995,
};

function parseItems(body: unknown): PriceRequestItem[] | null {
    if (!body || typeof body !== 'object' || !Array.isArray((body as { items?: unknown }).items)) return null;
    const items: PriceRequestItem[] = [];
    for (const raw of (body as { items: unknown[] }).items.slice(0, MAX_ITEMS)) {
        if (!raw || typeof raw !== 'object') continue;
        const { type, symbol, currency } = raw as Record<string, unknown>;
        if (typeof type !== 'string' || !ASSET_TYPES.includes(type as AssetType)) continue;
        if (typeof symbol !== 'string' || !symbol.trim() || symbol.length > 40) continue;
        items.push({
            type: type as AssetType,
            symbol: symbol.trim(),
            currency: currency === 'USD' || currency === 'EUR' ? currency : 'TRY',
        });
    }
    return items;
}

export async function POST(req: Request) {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 });
    }
    const items = parseItems(body);
    if (!items) return NextResponse.json({ error: '`items` dizisi gerekli' }, { status: 400 });

    const now = new Date().toISOString();
    const quotes: Record<string, Quote> = {};

    const yahooItems = items.filter(i => i.type === 'stock' || i.type === 'etf' || i.type === 'fund');
    const cryptoItems = items.filter(i => i.type === 'crypto');
    const cryptoId = (s: string) => COINGECKO_IDS[s.toUpperCase()] ?? s.toLowerCase();

    const [truncgil, yahoo, crypto, yahooFx] = await Promise.all([
        fetchTruncgilToday(),
        fetchYahooQuotes([...new Set(yahooItems.map(i => yahooSymbol(i.symbol, i.currency)))]),
        fetchCoinGeckoUsd([...new Set(cryptoItems.map(i => cryptoId(i.symbol)))]),
        // Fallback FX and gold (COMEX futures, USD/oz) sources, only used if Truncgil is down.
        fetchYahooQuotes(['USDTRY=X', 'EURTRY=X', 'GC=F']),
    ]);

    // --- FX (TRY per unit) ---
    const mid = (k: string) => {
        const it = truncgil?.items[k];
        return it && it.buying > 0 && it.selling > 0 ? (it.buying + it.selling) / 2 : 0;
    };
    const yahooRate = (s: string) => yahooFx.find(q => q.symbol === s)?.price ?? 0;
    const fx: FxRates = {
        TRY: 1,
        USD: mid('USD') || yahooRate('USDTRY=X'),
        EUR: mid('EUR') || yahooRate('EURTRY=X'),
    };

    // --- Stocks / ETFs / funds ---
    const yahooBySymbol = new Map(yahoo.map(q => [q.symbol.toUpperCase(), q]));
    for (const i of yahooItems) {
        const q = yahooBySymbol.get(yahooSymbol(i.symbol, i.currency));
        if (!q) continue;
        const currency: Currency = q.currency === 'USD' || q.currency === 'EUR' ? q.currency : 'TRY';
        quotes[holdingKey(i.type, i.symbol)] = { price: q.price, currency, changePercent: q.changePercent, asOf: now, source: 'live' };
    }

    // --- Gold & FX positions (Truncgil) ---
    const ounceUsd = yahooFx.find(q => q.symbol === 'GC=F');
    for (const i of items.filter(x => x.type === 'gold' || x.type === 'forex')) {
        const key = i.type === 'gold' ? i.symbol.toLowerCase() : i.symbol.toUpperCase();
        const it = truncgil?.items[key];
        if (it && it.buying > 0) {
            quotes[holdingKey(i.type, i.symbol)] = {
                price: it.buying,
                currency: key === 'ons' ? 'USD' : 'TRY',
                changePercent: it.changePercent,
                asOf: now,
                source: 'live',
            };
            continue;
        }
        // Fallback for pure-gold instruments: international ounce price × USD/TRY.
        // Coins and bracelets carry workmanship premiums, so they are not derived this way.
        if (i.type === 'gold' && ounceUsd && fx.USD > 0 && GOLD_FALLBACK_GRAMS[key]) {
            const grams = GOLD_FALLBACK_GRAMS[key];
            const usd = (ounceUsd.price * grams) / TROY_OUNCE_GRAMS;
            quotes[holdingKey(i.type, i.symbol)] = key === 'ons'
                ? { price: ounceUsd.price, currency: 'USD', changePercent: ounceUsd.changePercent, asOf: now, source: 'live' }
                : { price: usd * fx.USD, currency: 'TRY', changePercent: ounceUsd.changePercent, asOf: now, source: 'live' };
        }
    }

    // --- Crypto (USD) ---
    for (const i of cryptoItems) {
        const c = crypto[cryptoId(i.symbol)];
        if (!c) continue;
        quotes[holdingKey(i.type, i.symbol)] = { price: c.usd, currency: 'USD', changePercent: c.changePercent, asOf: now, source: 'live' };
    }

    const missing = items.map(i => holdingKey(i.type, i.symbol)).filter(k => !quotes[k]);
    return NextResponse.json({ quotes, fx, missing, updatedAt: now });
}
