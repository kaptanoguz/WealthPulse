// ============================================================
// WealthPulse AI — Shared market data sources (server-side only)
// ============================================================
//
// - Truncgil (finans.truncgil.com): gold (Kuyumcular Odası) and FX vs TRY
// - Yahoo Finance: BIST / US stocks, ETFs, some funds
// - CoinGecko: crypto in USD

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';

/** Turkish number format: "7.324,07" → 7324.07, "$2.875,30" → 2875.3. Numbers pass through. */
export function parseTurkishNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string' || !value) return 0;
    const cleaned = value.replace(/[$€₺%\s]/g, '');
    // With a comma, dots are thousand separators ("6.523,07"). Without one, "6.523" is still
    // grouped thousands, while "49.63" is a plain decimal.
    const normalized = cleaned.includes(',')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : /^-?\d{1,3}(\.\d{3})+$/.test(cleaned) ? cleaned.replace(/\./g, '') : cleaned;
    return parseFloat(normalized) || 0;
}

export function parseChangePercent(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string' || !value) return 0;
    return parseFloat(value.replace(/[%\s]/g, '').replace(',', '.')) || 0;
}

/** First present field among Truncgil's naming variants (v2/v3 Turkish, v4 English). */
function pick(item: Record<string, unknown>, keys: string[]): unknown {
    for (const k of keys) if (item[k] !== undefined && item[k] !== null && item[k] !== '') return item[k];
    return undefined;
}

export interface TruncgilItem {
    buying: number;
    selling: number;
    changePercent: number;
}

/** Raw today.json, keyed by Truncgil's own keys (USD, EUR, gram-altin, …). */
export async function fetchTruncgilToday(): Promise<{ items: Record<string, TruncgilItem>; updateDate: string } | null> {
    try {
        const res = await fetch('https://finans.truncgil.com/today.json', {
            headers: { 'User-Agent': UA },
            next: { revalidate: 120 },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const items: Record<string, TruncgilItem> = {};
        for (const [key, raw] of Object.entries(data)) {
            if (!raw || typeof raw !== 'object') continue;
            const item = raw as Record<string, unknown>;
            items[key] = {
                buying: parseTurkishNumber(pick(item, ['Alış', 'Alis', 'Buying', 'buying'])),
                selling: parseTurkishNumber(pick(item, ['Satış', 'Satis', 'Selling', 'selling'])),
                changePercent: parseChangePercent(pick(item, ['Değişim', 'Degisim', 'Change', 'change'])),
            };
        }
        const updateDate = pick(data, ['Update_Date', 'Güncelleme Tarihi', 'update_date']);
        return { items, updateDate: typeof updateDate === 'string' ? updateDate : '' };
    } catch (err) {
        console.error('Truncgil fetch error:', err);
        return null;
    }
}

export interface YahooQuote {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    currency: string;
    exchange: string;
}

export async function fetchYahooQuotes(symbols: string[]): Promise<YahooQuote[]> {
    if (symbols.length === 0) return [];
    try {
        const YahooFinance = (await import('yahoo-finance2')).default;
        const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
        const quotes = await yf.quote(symbols);
        return (Array.isArray(quotes) ? quotes : [quotes])
            .filter(q => q && q.regularMarketPrice)
            .map(q => ({
                symbol: q.symbol,
                name: q.shortName || q.longName || q.symbol,
                price: q.regularMarketPrice || 0,
                change: q.regularMarketChange || 0,
                changePercent: q.regularMarketChangePercent || 0,
                currency: q.currency || 'TRY',
                exchange: q.exchange || '',
            }));
    } catch (err) {
        console.error('Yahoo Finance fetch error:', err);
        return [];
    }
}

/** Common ticker → CoinGecko id. Unknown tickers are tried as ids directly. */
export const COINGECKO_IDS: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    BNB: 'binancecoin',
    SOL: 'solana',
    XRP: 'ripple',
    ADA: 'cardano',
    DOT: 'polkadot',
    DOGE: 'dogecoin',
    TRX: 'tron',
    AVAX: 'avalanche-2',
    LINK: 'chainlink',
    USDT: 'tether',
    USDC: 'usd-coin',
};

export async function fetchCoinGeckoUsd(ids: string[]): Promise<Record<string, { usd: number; changePercent: number }>> {
    if (ids.length === 0) return {};
    try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}&vs_currencies=usd&include_24hr_change=true`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 120 } });
        if (!res.ok) return {};
        const data = await res.json();
        const out: Record<string, { usd: number; changePercent: number }> = {};
        for (const id of ids) {
            if (data[id]?.usd) out[id] = { usd: data[id].usd, changePercent: data[id].usd_24h_change || 0 };
        }
        return out;
    } catch {
        return {};
    }
}
