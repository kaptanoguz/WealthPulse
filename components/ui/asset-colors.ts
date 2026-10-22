import type { AssetType } from '@/lib/portfolio';

/** One fixed color per asset class, used in every chart and table. Red is reserved for losses. */
export const ASSET_COLORS: Record<AssetType, string> = {
    stock: 'var(--wp-c1)',
    gold: 'var(--wp-c3)',
    forex: 'var(--wp-c2)',
    crypto: 'var(--wp-c4)',
    etf: 'var(--wp-c5)',
    fund: 'var(--wp-text-3)',
};
