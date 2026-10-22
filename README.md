# WealthPulse

Portfolio tracker with Monte Carlo projections, built for Turkish investors. Track stocks (BIST and US), gold, FX, funds and crypto in TRY, and see the range of outcomes your portfolio could reach, with inflation taken into account.

## Core

- **Portfolio tracking.** Holdings are built from a ledger of buy and sell trades.
  - Cost basis uses the weighted average cost method, tracked in TRY at each trade's FX rate. Currency gains on USD assets therefore show up in P&L.
  - Realized and unrealized P&L, daily change and allocation by asset class.
  - Live prices: Yahoo Finance (BIST/US stocks, ETFs), Kuyumcular Odası via Truncgil (gold, FX) and CoinGecko (crypto). Gold and FX are valued at the bid price.
  - When there's no price feed (most TEFAS funds), you can enter the price by hand. If a feed fails, the last known prices stay in use.
  - Data stays on your device (localStorage), and you can back it up or restore it as JSON.
- **Monte Carlo simulation.**
  - It starts from the portfolio's current value and allocation. Each asset class has its own return and volatility assumption, and the correlations between classes are applied.
  - You can add monthly contributions and an inflation rate, and view results in real terms (today's lira) or nominal terms.
  - It reports P10–P90 bands, the probability of beating inflation, the probability of a nominal loss, the probability of reaching a target, and the median maximum drawdown.
  - Runs are seeded, so the same inputs give the same result.

## Interface

- The UI is built for reading numbers. Panels sit on neutral surfaces with a single accent color. Every figure uses tabular numerals, numeric columns are right-aligned, and green and red are reserved for gains and losses.
- Light and dark themes are both supported, including a "follow the system" option. Charts read their colors from the same design tokens.
- Nothing on screen is decorative or fake: there are no placeholder profiles, notifications or demo prices. When a data source is down, the app says so.

## Optional modules (off by default)

Income/expense tracking, the news feed, reports and the AI chat widget are still in the codebase. They are turned off in [`lib/features.ts`](lib/features.ts) until they meet the same bar as the core: real data, persistence and tests. A disabled module is hidden from the menu, and its route returns 404.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests for the portfolio and Monte Carlo engines
npm run build
```

Core logic is plain TypeScript with no UI dependencies:

| File | Purpose |
| --- | --- |
| `lib/portfolio.ts` | Trade ledger → holdings, P&L, allocation, assumption blending |
| `lib/montecarlo.ts` | Seeded GBM simulation, percentiles, probabilities |
| `lib/portfolio-store.ts` | Persistence (localStorage), price refresh, backup/restore |
| `app/api/prices/route.ts` | Live quotes and TRY FX rates for held assets |
| `lib/market-sources.ts` | Truncgil / Yahoo / CoinGecko fetchers, tolerant of both Truncgil field formats |
| `components/ui/primitives.tsx` | Panel, StatStrip, PageHeader and chart tooltip used across pages |

## Tech

- **Frontend:** Next.js (React) + TypeScript + Mantine
- **Desktop:** Electron shell
- **Backend:** Next.js API routes

## Download

- **Windows:** `WealthPulseAI Setup.exe` from Releases
- **Linux:** `.deb` / `.AppImage`

> Not investment advice. Simulation results come from assumptions, not forecasts.

## License

MIT — Recep Oğuz Yağbasan
