import { NextResponse } from 'next/server';
import { fetchTruncgilToday } from '@/lib/market-sources';
import { GOLD_NAMES } from '@/lib/portfolio';

/**
 * Altın fiyatları — Kuyumcular Odası verisi
 * Kaynak: finans.truncgil.com (Kuyumcular Odası fiyatlarını yansıtır)
 * Gram Altın, Çeyrek, Yarım, Tam, Cumhuriyet, 22 Ayar Bilezik, 24 Ayar (Has) Altın
 */

interface GoldPrice {
    /** Truncgil key, also used as the portfolio symbol for gold. */
    key: string;
    name: string;
    buying: number;
    selling: number;
    change: number;
    changePercent: number;
    type: 'gold';
}

export async function GET() {
    const today = await fetchTruncgilToday();
    const gold: GoldPrice[] = [];

    if (today) {
        for (const [key, name] of Object.entries(GOLD_NAMES)) {
            const item = today.items[key];
            if (!item || item.selling <= 0) continue;
            gold.push({
                key,
                name,
                buying: item.buying,
                selling: item.selling,
                change: item.buying * (item.changePercent / 100),
                changePercent: item.changePercent,
                type: 'gold',
            });
        }
    }

    return NextResponse.json({
        data: gold,
        updatedAt: today?.updateDate || new Date().toISOString(),
        source: gold.length > 0 ? 'kuyumcular-odasi' : 'unavailable',
    });
}
