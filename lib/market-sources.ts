// ============================================================
// WealthPulse AI — Shared market data sources (server-side only)
// ============================================================
//
// - Truncgil (finans.truncgil.com): gold (Kuyumcular Odası) and FX vs TRY
// - Yahoo Finance: BIST / US stocks, ETFs, some funds
// - CoinGecko: crypto in USD

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36';

/** Turkish number format: "7.324,07" → 7324.07, "$2.875,30" → 2875.3 */
export function parseTurkishNumber(str: string): number {
    if (!str) return 0;
    const cleaned = str.replace('$', '').trim();
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
}

export function parseChangePercent(str: string): number {
    if (!str) return 0;
    return parseFloat(str.replace('%', '').replace(',', '.')) || 0;
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
            const item = raw as Record<string, string>;
            items[key] = {
                buying: parseTurkishNumber(item['Alış'] || item['Alis'] || '0'),
                selling: parseTurkishNumber(item['Satış'] || item['Satis'] || '0'),
                changePercent: parseChangePercent(item['Değişim'] || item['Degisim'] || '0'),
            };
        }
        return { items, updateDate: typeof data['Update_Date'] === 'string' ? data['Update_Date'] : '' };
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
