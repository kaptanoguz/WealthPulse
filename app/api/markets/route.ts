import { NextResponse } from 'next/server';
import { fetchTruncgilToday } from '@/lib/market-sources';

/**
 * Piyasa verileri API — Canlı Veri
 *
 * - BIST Hisse: yahoo-finance2 (canlı)
 * - US Hisse & ETF: yahoo-finance2 (canlı)
 * - Döviz: finans.truncgil.com (canlı)
 * - Kripto: CoinGecko API (canlı)
 */

// --- Types ---
interface MarketResponse {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    type: 'stock' | 'etf' | 'gold' | 'forex' | 'crypto' | 'fund';
    sparkline: number[];
    isLive: boolean;
    market?: string;
    currency?: string;
}

// --- Yahoo Finance for BIST + US Stocks + ETFs + Funds ---
const BIST_SYMBOLS = [
    { yahoo: 'THYAO.IS', display: 'THYAO', name: 'Türk Hava Yolları' },
    { yahoo: 'ASELS.IS', display: 'ASELS', name: 'ASELSAN' },
    { yahoo: 'GARAN.IS', display: 'GARAN', name: 'Garanti BBVA' },
    { yahoo: 'AKBNK.IS', display: 'AKBNK', name: 'Akbank' },
    { yahoo: 'SISE.IS', display: 'SISE', name: 'Şişecam' },
    { yahoo: 'EREGL.IS', display: 'EREGL', name: 'Ereğli Demir Çelik' },
    { yahoo: 'TUPRS.IS', display: 'TUPRS', name: 'Tüpraş' },
    { yahoo: 'KCHOL.IS', display: 'KCHOL', name: 'Koç Holding' },
    { yahoo: 'SAHOL.IS', display: 'SAHOL', name: 'Sabancı Holding' },
    { yahoo: 'BIMAS.IS', display: 'BIMAS', name: 'BİM Mağazalar' },
    { yahoo: 'YKBNK.IS', display: 'YKBNK', name: 'Yapı Kredi Bankası' },
    { yahoo: 'ISCTR.IS', display: 'ISCTR', name: 'İş Bankası (C)' },
    { yahoo: 'HALKB.IS', display: 'HALKB', name: 'Halkbank' },
    { yahoo: 'VAKBN.IS', display: 'VAKBN', name: 'Vakıfbank' },
    { yahoo: 'PETKM.IS', display: 'PETKM', name: 'Petkim' },
    { yahoo: 'KRDMD.IS', display: 'KRDMD', name: 'Kardemir (D)' },
    { yahoo: 'PGSUS.IS', display: 'PGSUS', name: 'Pegasus' },
    { yahoo: 'DOAS.IS', display: 'DOAS', name: 'Doğuş Otomotiv' },
    { yahoo: 'FROTO.IS', display: 'FROTO', name: 'Ford Otosan' },
    { yahoo: 'TOASO.IS', display: 'TOASO', name: 'Tofaş' },
    { yahoo: 'TTRAK.IS', display: 'TTRAK', name: 'Türk Traktör' },
    { yahoo: 'ARCLK.IS', display: 'ARCLK', name: 'Arçelik' },
    { yahoo: 'VESTL.IS', display: 'VESTL', name: 'Vestel' },
    { yahoo: 'TCELL.IS', display: 'TCELL', name: 'Turkcell' },
    { yahoo: 'TTKOM.IS', display: 'TTKOM', name: 'Türk Telekom' },
    { yahoo: 'MGROS.IS', display: 'MGROS', name: 'Migros' },
    { yahoo: 'SOKM.IS', display: 'SOKM', name: 'Şok Marketler' },
    { yahoo: 'AEFES.IS', display: 'AEFES', name: 'Anadolu Efes' },
    { yahoo: 'CCOLA.IS', display: 'CCOLA', name: 'Coca-Cola İçecek' },
    { yahoo: 'ENJSA.IS', display: 'ENJSA', name: 'Enerjisa' },
    { yahoo: 'AKSEN.IS', display: 'AKSEN', name: 'Aksa Enerji' },
    { yahoo: 'SASA.IS', display: 'SASA', name: 'Sasa Polyester' },
    { yahoo: 'HEKTS.IS', display: 'HEKTS', name: 'Hektaş' },
    { yahoo: 'ALARK.IS', display: 'ALARK', name: 'Alarko Holding' },
    { yahoo: 'ENKAI.IS', display: 'ENKAI', name: 'Enka İnşaat' },
    { yahoo: 'ASTOR.IS', display: 'ASTOR', name: 'Astor Enerji' },
    { yahoo: 'KONTR.IS', display: 'KONTR', name: 'Kontrolmatik' },
    { yahoo: 'SMRTG.IS', display: 'SMRTG', name: 'Smart Güneş Enerjisi' },
    { yahoo: 'ODAS.IS', display: 'ODAS', name: 'Odaş Elektrik' },
    { yahoo: 'ZOREN.IS', display: 'ZOREN', name: 'Zorlu Enerji' },
    { yahoo: 'CWENE.IS', display: 'CWENE', name: 'CW Enerji' },
    { yahoo: 'EUPWR.IS', display: 'EUPWR', name: 'Europower Enerji' },
    { yahoo: 'GESAN.IS', display: 'GESAN', name: 'Girişim Elektrik' },
    { yahoo: 'YEOTK.IS', display: 'YEOTK', name: 'Yeo Teknoloji' },
    { yahoo: 'ALFAS.IS', display: 'ALFAS', name: 'Alfa Solar Enerji' },
    { yahoo: 'KOZAL.IS', display: 'KOZAL', name: 'Koza Altın' },
    { yahoo: 'KOZAA.IS', display: 'KOZAA', name: 'Koza Anadolu Metal' },
    { yahoo: 'IPEKE.IS', display: 'IPEKE', name: 'İpek Doğal Enerji' },
    { yahoo: 'TAVHL.IS', display: 'TAVHL', name: 'TAV Havalimanları' },
    { yahoo: 'TKFEN.IS', display: 'TKFEN', name: 'Tekfen Holding' },
    { yahoo: 'DOHOL.IS', display: 'DOHOL', name: 'Doğan Holding' },
    { yahoo: 'GSDHO.IS', display: 'GSDHO', name: 'GSD Holding' },
    { yahoo: 'KORDS.IS', display: 'KORDS', name: 'Kordsa' },
    { yahoo: 'BRYAT.IS', display: 'BRYAT', name: 'Borusan Yatırım' },
    { yahoo: 'BRSAN.IS', display: 'BRSAN', name: 'Borusan Boru' },
    { yahoo: 'OTKAR.IS', display: 'OTKAR', name: 'Otokar' },
    { yahoo: 'KONYA.IS', display: 'KONYA', name: 'Konya Çimento' },
    { yahoo: 'EGEEN.IS', display: 'EGEEN', name: 'Ege Endüstri' },
    { yahoo: 'BFREN.IS', display: 'BFREN', name: 'Bosch Fren' },
    { yahoo: 'ASUZU.IS', display: 'ASUZU', name: 'Anadolu Isuzu' },
    { yahoo: 'TMSN.IS', display: 'TMSN', name: 'Tümosan' },
    { yahoo: 'ULKER.IS', display: 'ULKER', name: 'Ülker Bisküvi' },
    { yahoo: 'TATGD.IS', display: 'TATGD', name: 'Tat Gıda' },
    { yahoo: 'CANTE.IS', display: 'CANTE', name: 'Çan2 Termik' },
    { yahoo: 'QUAGR.IS', display: 'QUAGR', name: 'Qua Granite' },
    { yahoo: 'BIENN.IS', display: 'BIENN', name: 'Bien Yapı' },
];

const US_SYMBOLS = [
    { yahoo: 'AAPL', display: 'AAPL', name: 'Apple Inc.' },
    { yahoo: 'MSFT', display: 'MSFT', name: 'Microsoft' },
    { yahoo: 'GOOGL', display: 'GOOGL', name: 'Alphabet (Google)' },
    { yahoo: 'AMZN', display: 'AMZN', name: 'Amazon' },
    { yahoo: 'NVDA', display: 'NVDA', name: 'NVIDIA' },
    { yahoo: 'META', display: 'META', name: 'Meta Platforms' },
    { yahoo: 'TSLA', display: 'TSLA', name: 'Tesla' },
];

const ETF_SYMBOLS = [
    { yahoo: 'SPY', display: 'SPY', name: 'S&P 500 ETF' },
    { yahoo: 'QQQ', display: 'QQQ', name: 'Nasdaq 100 ETF' },
    { yahoo: 'VOO', display: 'VOO', name: 'Vanguard S&P 500' },
    { yahoo: 'VTI', display: 'VTI', name: 'Vanguard Total Market' },
    { yahoo: 'IWM', display: 'IWM', name: 'Russell 2000 ETF' },
];

// Note: TEFAS/BEFAS funds are not available via Yahoo Finance API
// A future integration with the TEFAS platform would be needed

async function fetchYahooQuotes(
    symbolDefs: typeof BIST_SYMBOLS,
    type: MarketResponse['type'],
    market?: string
): Promise<MarketResponse[]> {
    try {
        // Dynamic import for yahoo-finance2
        const YahooFinance = (await import('yahoo-finance2')).default;
        const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

        const yahooSymbols = symbolDefs.map(s => s.yahoo);
        const quotes = await yf.quote(yahooSymbols);

        const symbolMap = new Map(symbolDefs.map(s => [s.yahoo, s]));

        return (Array.isArray(quotes) ? quotes : [quotes])
            .filter(q => q && q.regularMarketPrice)
            .map(q => {
                const def = symbolMap.get(q.symbol);
                return {
                    symbol: def?.display || q.symbol.replace('.IS', ''),
                    name: def?.name || q.shortName || q.longName || q.symbol,
                    price: q.regularMarketPrice || 0,
                    change: q.regularMarketChange || 0,
                    changePercent: q.regularMarketChangePercent || 0,
                    type,
                    sparkline: [],
                    isLive: true,
                    market: market || (q.exchange || ''),
                    currency: q.currency || 'TRY',
                };
            });
    } catch (err) {
        console.error(`Yahoo Finance fetch error for ${type}:`, err);
        return [];
    }
}

// --- Döviz from truncgil ---
async function fetchForex(): Promise<MarketResponse[]> {
    const today = await fetchTruncgilToday();
    if (!today) return [];
    const forexMap: Record<string, string> = {
        'USD': 'ABD Doları',
        'EUR': 'Euro',
        'GBP': 'İngiliz Sterlini',
        'CHF': 'İsviçre Frangı',
    };
    return Object.entries(forexMap).flatMap(([key, name]) => {
        const item = today.items[key];
        if (!item || item.buying <= 0 || item.selling <= 0) return [];
        const midPrice = (item.buying + item.selling) / 2;
        return [{
            symbol: `${key}/TRY`,
            name,
            price: midPrice,
            change: midPrice * (item.changePercent / 100),
            changePercent: item.changePercent,
            type: 'forex' as const,
            sparkline: [],
            isLive: true,
            currency: 'TRY',
        }];
    });
}

// --- TEFAS Funds Integration ---
const TEFAS_SYMBOLS = [
    { symbol: 'TI1', name: 'İş Portföy Hisse Senedi Fonu', type: 'fund' },
    { symbol: 'MAC', name: 'Marmara Capital Hisse Senedi Fonu', type: 'fund' },
    { symbol: 'AFT', name: 'Ak Portföy Yeni Teknolojiler Fonu', type: 'fund' },
    { yahoo: 'YAY.IS', symbol: 'YAY', name: 'Yapı Kredi Yabancı Teknoloji Fonu', type: 'fund' },
    { symbol: 'GUM', name: 'Ak Portföy Gümüş Fon Sepeti Fonu', type: 'fund' },
    { symbol: 'GOL', name: 'İş Portföy Altın Fonu', type: 'fund' },
    { symbol: 'NFF', name: 'Hedef Portföy Birinci Hisse Senedi Fonu', type: 'fund' },
    { symbol: 'GSP', name: 'Azimut Portföy Birinci Hisse Senedi Fonu', type: 'fund' },
    { symbol: 'IPJ', name: 'İş Portföy Elektrikli Araçlar Karma Fon', type: 'fund' },
    { symbol: 'KPT', name: 'Kuveyt Türk Katılım Hisse Senedi Fonu', type: 'fund' },
    { symbol: 'IPV', name: 'İş Portföy Kira Sertifikaları Fonu', type: 'fund' },
    { symbol: 'TDF', name: 'İş Portföy Değişken Fon', type: 'fund' },
    { symbol: 'YDI', name: 'Yapı Kredi Altın Fonu', type: 'fund' },
    { symbol: 'OJD', name: 'QNB Finans Portföy Dijital Teknolojiler Fonu', type: 'fund' },
    { symbol: 'ZPF', name: 'Ziraat Portföy Katılım Fonu', type: 'fund' },
];

async function fetchFunds(): Promise<MarketResponse[]> {
    try {
        // Some funds are on Yahoo, we fetch them first
        const yahooFunds = TEFAS_SYMBOLS.filter(s => s.yahoo);
        const yahooData = yahooFunds.length > 0 ? await fetchYahooQuotes(yahooFunds.map(f => ({ yahoo: f.yahoo!, display: f.symbol, name: f.name })), 'fund', 'TEFAS') : [];

        // Funds without a Yahoo listing have no free live feed yet (TEFAS integration pending).
        // Don't invent prices for them; the portfolio lets users enter those manually.
        return yahooData;
    } catch {
        return [];
    }
}

// --- Kripto from CoinGecko ---
async function fetchCrypto(): Promise<MarketResponse[]> {
    try {
        const res = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,solana,ripple,cardano,polkadot,dogecoin,tron&vs_currencies=usd&include_24hr_change=true',
            {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                next: { revalidate: 120 },
            }
        );
        if (!res.ok) return [];
        const data = await res.json();

        const cryptoMap: Record<string, { symbol: string; name: string }> = {
            bitcoin: { symbol: 'BTC/USD', name: 'Bitcoin' },
            ethereum: { symbol: 'ETH/USD', name: 'Ethereum' },
            binancecoin: { symbol: 'BNB/USD', name: 'BNB' },
            solana: { symbol: 'SOL/USD', name: 'Solana' },
            ripple: { symbol: 'XRP/USD', name: 'Ripple (XRP)' },
            cardano: { symbol: 'ADA/USD', name: 'Cardano' },
            dogecoin: { symbol: 'DOGE/USD', name: 'Dogecoin' },
            tron: { symbol: 'TRX/USD', name: 'TRON' },
        };

        return Object.entries(cryptoMap)
            .filter(([id]) => data[id])
            .map(([id, meta]) => {
                const price = data[id].usd || 0;
                const changePct = data[id].usd_24h_change || 0;
                return {
                    symbol: meta.symbol,
                    name: meta.name,
                    price,
                    change: price * (changePct / 100),
                    changePercent: changePct,
                    type: 'crypto' as const,
                    sparkline: [],
                    isLive: true,
                    currency: 'USD',
                };
            });
    } catch {
        return [];
    }
}

export async function GET() {
    // Fetch everything in parallel
    const [bistStocks, usStocks, etfs, forex, crypto, funds] = await Promise.all([
        fetchYahooQuotes(BIST_SYMBOLS, 'stock', 'BIST'),
        fetchYahooQuotes(US_SYMBOLS, 'stock', 'NASDAQ/NYSE'),
        fetchYahooQuotes(ETF_SYMBOLS, 'etf', 'US-ETF'),
        fetchForex(),
        fetchCrypto(),
        fetchFunds(),
    ]);

    const allData = [...bistStocks, ...usStocks, ...etfs, ...forex, ...crypto, ...funds];
    const liveCount = allData.filter(d => d.isLive).length;

    return NextResponse.json({
        data: allData,
        updatedAt: new Date().toISOString(),
        source: liveCount > 0 ? 'live' : 'demo',
        counts: {
            bistStocks: bistStocks.length,
            usStocks: usStocks.length,
            etfs: etfs.length,
            forex: forex.length,
            crypto: crypto.length,
            funds: funds.length,
        },
    });
}
