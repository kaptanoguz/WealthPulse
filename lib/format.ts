// ============================================================
// WealthPulse AI — Formatting helpers
// ============================================================

export function formatCurrency(value: number, currency = 'TRY'): string {
    return new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

export function formatPercent(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number, maxDecimals = 2): string {
    return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDecimals,
    }).format(value);
}

/** Short axis labels: ₺950B, ₺1,2Mn, ₺3,4Mr */
export function formatCompactTRY(value: number): string {
    return '₺' + new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
