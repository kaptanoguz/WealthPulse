// ============================================================
// WealthPulse — Formatting helpers (Turkish locale throughout)
// ============================================================

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, decimals: number, signed: boolean): Intl.NumberFormat {
    const key = `${currency}|${decimals}|${signed}`;
    let f = currencyFormatters.get(key);
    if (!f) {
        f = new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency,
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
            signDisplay: signed ? 'exceptZero' : 'auto',
        });
        currencyFormatters.set(key, f);
    }
    return f;
}

/** ₺1.234,56 — very small unit prices (funds, some crypto) get more decimals. */
export function formatCurrency(value: number, currency = 'TRY'): string {
    const abs = Math.abs(value);
    const decimals = abs > 0 && abs < 1 ? 4 : 2;
    return currencyFormatter(currency, decimals, false).format(value);
}

/** +₺1.234,56 / −₺1.234,56 */
export function formatSignedCurrency(value: number, currency = 'TRY'): string {
    return currencyFormatter(currency, 2, true).format(value);
}

/** Whole-lira amount for large totals: ₺691.155 */
export function formatCurrency0(value: number, currency = 'TRY'): string {
    return currencyFormatter(currency, 0, false).format(value);
}

const pctSigned = new Intl.NumberFormat('tr-TR', {
    style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero',
});

/** Input is in percent units: 2.5 → "+%2,50" */
export function formatPercent(value: number): string {
    return pctSigned.format(value / 100);
}

/** Unsigned share, input in percent units: 36.8 → "%36,8" */
export function formatShare(value: number, decimals = 1): string {
    return new Intl.NumberFormat('tr-TR', {
        style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(value / 100);
}

/** Probability 0..1 → "%59,0" */
export function formatProbability(p: number): string {
    return formatShare(p * 100, 1);
}

export function formatNumber(value: number, maxDecimals = 2): string {
    return new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: maxDecimals,
    }).format(value);
}

/** Short axis labels: ₺950 B, ₺1,2 Mn */
export function formatCompactTRY(value: number): string {
    return '₺' + new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatDate(iso: string): string {
    const d = iso.length === 10 ? new Date(iso + 'T00:00:00') : new Date(iso);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

/** "14:05" if today, otherwise "21.10.2026 14:05" */
export function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay ? formatTime(iso) : `${formatDate(iso)} ${formatTime(iso)}`;
}
