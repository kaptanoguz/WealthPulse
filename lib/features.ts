// ============================================================
// WealthPulse AI — Module switches
// ============================================================
//
// The product's core is portfolio tracking + Monte Carlo simulation.
// The modules below are kept in the codebase but are off until they are
// brought up to the same standard (real data, persistence, tests).
// A disabled module is hidden from the menu and its route returns 404.

export const FEATURES = {
    /** Gelir / gider takibi (app/(dashboard)/budget) — in-memory only, no persistence yet. */
    budget: false,
    /** Ekonomi haberleri (app/(dashboard)/news). */
    news: false,
    /** Raporlar (app/(dashboard)/reports) — placeholder cards only. */
    reports: false,
    /** AI sohbet balonu — canned answers, not connected to a model. */
    aiChat: false,
} as const;

export type FeatureName = keyof typeof FEATURES;
