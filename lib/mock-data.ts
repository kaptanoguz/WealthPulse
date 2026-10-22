// ============================================================
// WealthPulse AI — Mock Data
// Offline fallback for the markets page and the (disabled) AI chat widget.
// Portfolio and simulator never read from here.
// ============================================================

export interface MarketItem {
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    type: 'stock' | 'etf' | 'gold' | 'forex' | 'crypto' | 'fund';
    sparkline: number[];
    isLive?: boolean;
    market?: string;
    currency?: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

// Market data
export const marketData: MarketItem[] = [
    { symbol: 'THYAO', name: 'Türk Hava Yolları', price: 312.80, change: 7.15, changePercent: 2.34, type: 'stock', sparkline: [290, 295, 298, 302, 305, 299, 303, 308, 312, 310, 314, 312.8] },
    { symbol: 'ASELS', name: 'ASELSAN', price: 57.20, change: -0.50, changePercent: -0.87, type: 'stock', sparkline: [55, 56, 57.5, 58, 57, 56.5, 57.8, 57.7, 56.9, 57.5, 57, 57.2] },
    { symbol: 'SISE', name: 'Şişecam', price: 49.10, change: 0.75, changePercent: 1.56, type: 'stock', sparkline: [46, 46.5, 47, 47.8, 48, 47.5, 48.2, 48.5, 49, 48.8, 49.2, 49.1] },
    { symbol: 'GARAN', name: 'Garanti BBVA', price: 138.40, change: 1.53, changePercent: 1.12, type: 'stock', sparkline: [132, 134, 133, 135, 136, 137, 136.5, 137.5, 138, 137.8, 139, 138.4] },
    { symbol: 'AKBNK', name: 'Akbank', price: 65.80, change: 0.50, changePercent: 0.76, type: 'stock', sparkline: [62, 63, 63.5, 64, 63.8, 64.5, 65, 64.8, 65.3, 65.5, 66, 65.8] },
    { symbol: 'EREGL', name: 'Ereğli Demir Çelik', price: 52.30, change: -0.40, changePercent: -0.76, type: 'stock', sparkline: [51, 52, 53, 52.5, 52.8, 52, 51.5, 52.3, 53, 52.7, 52.5, 52.3] },
    { symbol: 'TUPRS', name: 'Tüpraş', price: 185.60, change: 3.20, changePercent: 1.75, type: 'stock', sparkline: [178, 180, 179, 181, 183, 182, 184, 183, 185, 184, 186, 185.6] },
    { symbol: 'XAU/TRY', name: 'Altın (Gram TL)', price: 3124.50, change: 13.05, changePercent: 0.42, type: 'gold', sparkline: [3050, 3060, 3075, 3090, 3085, 3095, 3100, 3110, 3105, 3115, 3120, 3124.5] },
    { symbol: 'XAU/USD', name: 'Altın (Ons USD)', price: 2875.30, change: -8.50, changePercent: -0.30, type: 'gold', sparkline: [2860, 2870, 2880, 2885, 2878, 2882, 2875, 2880, 2872, 2878, 2876, 2875.3] },
    { symbol: 'USD/TRY', name: 'ABD Doları', price: 36.42, change: -0.05, changePercent: -0.15, type: 'forex', sparkline: [36.2, 36.3, 36.4, 36.5, 36.45, 36.48, 36.42, 36.44, 36.40, 36.43, 36.41, 36.42] },
    { symbol: 'EUR/TRY', name: 'Euro', price: 39.18, change: 0.03, changePercent: 0.08, type: 'forex', sparkline: [38.9, 39.0, 39.1, 39.05, 39.12, 39.08, 39.15, 39.18, 39.10, 39.14, 39.16, 39.18] },
    { symbol: 'GBP/TRY', name: 'İngiliz Sterlini', price: 46.25, change: 0.18, changePercent: 0.39, type: 'forex', sparkline: [45.8, 45.9, 46.0, 46.1, 46.0, 46.15, 46.2, 46.1, 46.18, 46.22, 46.25, 46.25] },
    { symbol: 'BTC/USD', name: 'Bitcoin', price: 87500, change: 2890, changePercent: 3.42, type: 'crypto', sparkline: [82000, 83000, 84000, 83500, 85000, 84500, 86000, 85500, 87000, 86500, 88000, 87500] },
    { symbol: 'ETH/USD', name: 'Ethereum', price: 3240, change: 85, changePercent: 2.69, type: 'crypto', sparkline: [3050, 3080, 3100, 3060, 3120, 3150, 3130, 3180, 3200, 3210, 3250, 3240] },
];

// AI chat initial messages
export const initialChatMessages: ChatMessage[] = [
    {
        id: 'msg1',
        role: 'assistant',
        content: '👋 Merhaba! Ben WealthPulse AI Danışmanınızım. Portföyünüz hakkında sorularınızı yanıtlayabilir, piyasa analizi yapabilir ve yatırım stratejileri hakkında bilgi verebilirim.\n\n**Not:** Verdiğim bilgiler yatırım tavsiyesi niteliğinde değildir.',
        timestamp: new Date().toISOString(),
    },
];

// Format helpers (moved to lib/format.ts)
export { formatCurrency, formatPercent, formatNumber } from './format';
