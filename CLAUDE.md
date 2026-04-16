# Bloodwork — CLAUDE.md

## What This Is
A desktop app for tracking blood test results over time. Users upload pathology reports (PDF or image); Claude extracts the values automatically. Manual entry is also supported. Built with SvelteKit + Tauri.

## Tech Stack
- **Framework**: SvelteKit 2.x with Svelte 5 runes, `adapter-static` (SPA mode)
- **Desktop shell**: Tauri 2 — wraps the SvelteKit SPA in a native window; SQLite for storage
- **Charting**: Apache ECharts 6 (canvas renderer) — time-series with `xAxis.type = 'time'` for proportional temporal spacing
- **Database**: SQLite via `tauri-plugin-sql` (desktop), with Dexie/IndexedDB fallback for browser dev
- **AI Extraction**: Anthropic Claude API, called directly from the desktop app using the `anthropic-dangerous-direct-browser-access` header (no proxy needed for a native app)
- **Language**: TypeScript throughout
- **Styling**: Plain CSS with CSS custom properties (design tokens in `app.css`)

## Project Structure
```
src/
├── lib/
│   ├── core/           # Framework-agnostic business logic (pure TS)
│   │   ├── types.ts    # All TypeScript interfaces
│   │   ├── db.ts       # SQLite + Dexie storage abstraction
│   │   ├── biomarkers.ts # Biomarker definitions + fuzzy matching
│   │   ├── charting.ts # ECharts option builders
│   │   └── units.ts    # Unit conversion (mmol/L ↔ mg/dL etc.)
│   ├── components/     # Svelte UI components
│   └── data/           # Static JSON (biomarker definitions)
└── routes/
    ├── +layout.svelte         # App shell, nav, first-run setup
    ├── +page.svelte           # Dashboard
    ├── import/+page.svelte    # Manual entry + AI import
    ├── charts/+page.svelte    # Multi-biomarker charting
    ├── biomarkers/            # Biomarker list + detail pages
    ├── milestones/+page.svelte
    └── settings/+page.svelte  # API key + thresholds + data export/import
```

## Build Commands
```bash
npm run dev           # SvelteKit dev server (browser — no Tauri, no SQLite)
npm run tauri:dev     # Full desktop app in dev mode (hot reload)
npm run tauri:build   # Production build
npm run check         # TypeScript + Svelte type checking
```

## Key Conventions
1. **Core logic stays framework-agnostic** — `src/lib/core/` must not import Svelte.
2. **Storage abstraction** — all pages use `db.ts`. The `isTauri()` check inside routes to SQLite vs Dexie automatically.
3. **ECharts options built in `charting.ts`** — components receive complete option objects. `Chart.svelte` handles init/resize/dispose.
4. **CSS custom properties for theming** — all colors use `var(--token)` from `app.css`. No hard-coded colors.
5. **Biomarker IDs are kebab-case** — e.g., `ldl-cholesterol`, `hs-crp`. Defined in `biomarker-definitions.json`.
6. **Dates stored as ISO strings in SQLite** — always use `new Date()` when reading back.
7. **First-run setup** — `+layout.svelte` checks for the API key after DB init and shows `SetupScreen.svelte` if missing.
