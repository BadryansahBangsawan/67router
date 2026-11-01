---
title: "Design System & Visual Identity"
lastUpdated: 2026-10-30
---

# 67router — Design System & Visual Identity

> **Status:** the dashboard is built on the **Keak CI UI Kit** (`@keak/cheaper-inference-ui-kit`), vendored
> as the workspace `packages/ui-kit` (`@omniroute/ui-kit`; the upstream snapshot is pinned in
> `packages/ui-kit/UPSTREAM.md` and guarded by `npm run check:ui-kit-snapshot`), re-themed to the
> **67router** palette without patching the kit. Light is the canonical theme; the default preference
> is `system`. The palette is monochrome: the kit accent (`--ci-color-accent`) is the solid primary —
> near-black `#0a0a0a` in light, near-white `#fafafa` in dark — and the only hue outside the status
> colors is the 67router orange `#ff4f00`, reserved for fallback / recovered requests. Geist is
> the UI family and also the display face (`--ci-font-display` points at `--ci-font-ui`; there is no
> display serif), Geist Mono carries code, model ids, URLs and keys — both self-hosted through the
> `@fontsource-variable/geist` and `@fontsource-variable/geist-mono` imports at the top of
> `src/app/globals.css`. Every icon is a Lucide glyph.

## 1. Where things live

- **Kit.** `packages/ui-kit/src` is a byte-for-byte copy of the upstream `src/` at the commit pinned in
  `packages/ui-kit/UPSTREAM.md` (which also records the license authorization); `PATCHES.md` lists local
  patches (none). It is consumed as source, with no build: `next.config.mjs` transpiles it, and
  `tsconfig.json` maps `@omniroute/ui-kit` → `packages/ui-kit/src` and `@omniroute/ui-kit/*` →
  `packages/ui-kit/src/*` (`vitest.config.ts` and `vitest.mcp.config.ts` carry the same alias). Import a
  kit component by its subpath (`@omniroute/ui-kit/table`, `@omniroute/ui-kit/page-header`…), never
  through the `@omniroute/ui-kit` barrel: the barrel pulls every component (including the date picker)
  into each importer. The kit stylesheet enters through `src/app/globals.css`
  (`@import "../../packages/ui-kit/src/ci-ui.css"`).
- **67router palette.** The top of `src/app/globals.css` declares `--r67-*` (the only hex values in the
  theme; light in `:root, .ci-theme`, dark in the `[data-theme="dark"]` forms) and re-points the kit's
  semantic `--ci-*` tokens at them. Surfaces: page `--r67-page`, card `--r67-card`, border
  `--r67-border`, text `--r67-text` / `--r67-text-secondary` / `--r67-text-muted`. Status: green
  `--r67-success`, amber `--r67-warning` (the light value is the AA text tone; `--r67-warning-border`
  for borders), red `--r67-danger`, and a hollow neutral `--r67-neutral-dot` for idle / cooldown.
  Chart series are greys plus green (`--ci-chart-1` … `--ci-chart-5`). Orange (`--r67-fallback`,
  utilities `bg-fallback` / `text-fallback`; text reads the darker `--r67-fallback-text`) is never a
  general accent.
- **Tokens.** `packages/ui-kit/src/ci-tokens.css` declares the `--ci-*` tokens; `src/app/globals.css`
  bridges them to the legacy 67router names (`--color-*`, `--radius-*`, `--font-sans`/`--font-mono`,
  `--table-*`, `--orch-status-*`, `--color-fd-*`), so the existing `var(--color-*)` reads and Tailwind
  utilities keep working. New code uses the Tailwind utilities (`bg-surface`, `text-text-muted`,
  `border-border`, `text-success`, `bg-success-bg`, `bg-chart-1`…) or kit classes — never a hex value
  (`tests/unit/design-kit-bridge.test.ts` enforces the bridge). `text-primary` resolves to
  `--color-primary-ink` through `--text-color-primary`; with the monochrome accent the ink is the accent
  itself, so `text-primary`, `bg-primary` and `border-primary` all read the solid primary. Chart series
  use `--color-chart-1` … `--color-chart-5`.
- **Themes.** `<html className="ci-theme">` (`src/app/layout.tsx`) opts the document into the kit theme.
  The preference is `light`, `dark` or `system` (`THEME_CONFIG.defaultTheme = "system"` in
  `src/shared/constants/appConfig.ts`; `system` follows `prefers-color-scheme`). `applyTheme()` in
  `src/store/themeStore.ts` (mirrored by the inline bootstrap script in `src/app/layout.tsx`, which runs
  before hydration) sets `data-theme="dark"|"light"` and toggles the `.dark` class on `<html>` together.
  The kit's dark token set is keyed on `data-theme="dark"` (`packages/ui-kit/src/ci-tokens.css`);
  67router's own dark overrides (the `.dark` block in `globals.css`) and the legacy Tailwind `dark:`
  utilities key on the `.dark` class. There are no accent color presets: the accent always comes from the
  kit, and a persisted preset from an older build is dropped when the store loads.
- **Components (adapters).** `src/shared/components/index.tsx` keeps the 67router component API (same
  names, default exports and props), and the primitives behind it are adapters over the kit: forms
  (`Button`, `Input`, `Textarea`, `Checkbox`, `Select`, `Toggle`, `Badge`, `Card`), overlays and feedback
  (`Modal`/`ConfirmModal`, `Tooltip`/`InfoTooltip`, `NotificationToast`, `EmptyState`, `Loading`),
  structure (`Collapsible`, `CollapsibleSection`, `SegmentedControl`, `Breadcrumbs`, `Avatar`) and tables
  (`DataTable`, `FilterBar`, `ColumnToggle`, `FilterPills`, `PresetSlider`). An adapter imports the kit
  component by subpath and maps the legacy props onto it — for example `Button variant="primary"` is the
  kit `default` button (`--ci-button-primary-*`: the solid primary with page-colored ink — black on
  white in light, white on black in dark), `danger` is `destructive`, and `warning` is `outline` plus
  the `.ci-button--warning` extension. The `.ci-button--warning` and `.ci-badge[data-tone]` rules at the
  end of `globals.css` (`@layer components`) are 67router extensions on top of the kit classes.
  `tests/unit/ui/adapters/*.test.tsx` pin each adapter.
- **Shell.** `src/app/(dashboard)/layout.tsx` renders `DashboardLayout`, which renders
  `src/shared/components/layouts/DashboardShell.tsx`: the kit `SidebarProvider` / `Sidebar` /
  `SidebarInset` (`packages/ui-kit/src/sidebar.tsx`), with 67router's navigation logic in
  `src/shared/components/Sidebar.tsx`. A "skip to content" link to `#main-content` is the first focusable
  element. `src/shared/components/Header.tsx` holds the kit `SidebarTrigger` (the shell's only sidebar
  toggle), the kit `ProductSwitcher` (destinations in `src/shared/constants/keakProducts.ts`) and the
  command-palette opener; it shows the route title only while
  no kit `PageHeader` (`.ci-page-header`) is mounted inside `#main-content`, so a page with its own
  `PageHeader` has a single `h1`. `src/shared/components/CommandPalette.tsx` is a kit `Dialog`.
- **Icons.** `<Icon name="material_name">` (`src/shared/components/Icon.tsx`) resolves the name (the
  Material Symbols vocabulary the screens use) through `ICON_MAP` (`src/shared/constants/iconMap.ts`) to a
  Lucide glyph. The Material Symbols font and package are gone: a name missing from the map renders a
  neutral placeholder glyph (`data-icon-missing="true"`) and logs a console warning outside production.
  `npm run gen:icon-map` prints the names in use that are missing from the map
  (`tests/unit/icon-map-coverage.test.ts` fails on any name without a Lucide icon;
  `tests/unit/icon-map-object-values.test.ts` covers names stored in lookup objects);
  `scripts/dev/codemod-material-icons.mjs <dir|file>... [--write]` rewrites literal
  `<span className="material-symbols-outlined">` spans to `<Icon>`.
- **Brand.** `src/shared/components/OmniRouteLogo.tsx` draws the 67router mark itself: the default
  export `OmniRouteLogo` is an inline SVG (`basePath`-safe; `BRAND_MARK_CIRCLE` + `BRAND_MARK_PATH`, one
  `currentColor` stroke) and `OmniRouteLockup` is the mark plus the `BRAND_WORDMARK` "67router"
  (accessible name "67router") or, for white-label operators, their own `name`/`logoSrc`.
  Product-switcher destinations live in `src/shared/constants/keakProducts.ts` (`KEAK_PRODUCT_LINKS`,
  `KEAK_ACTIVE_PRODUCT`). The standalone
  screens — `src/app/login/page.tsx`, `src/app/status/page.tsx`, `src/app/maintenance/page.tsx`,
  `src/app/offline/page.tsx`, `src/app/not-found.tsx` and `src/shared/components/ErrorPageScaffold.tsx`
  — show the lockup; `tests/unit/brand-pages-static.test.ts` guards it.

## 2. Rules

1. Tokens, never literals. Exceptions kept on purpose: the `--r67-*` palette block itself, the
   always-dark console terminal, `STATUS_HEX` (`src/shared/constants/statusColors.ts`: the 67router
   status palette as light-mode hex — green `#16a34a`, amber `#d97706`, red `#dc2626`, neutral greys,
   orange only as `fallback` — for canvas or colour math that cannot read a `var()`; flow edges use
   `var(--orch-status-*)`), and the categorical palettes
   `STRATEGY_COLORS` (`src/app/(dashboard)/dashboard/combos/live/nodes/StrategyNode.tsx`) and
   `LAYER_COLORS` (`src/app/(dashboard)/dashboard/compression/studio/nodes/EngineNode.tsx`).
2. Never patch `packages/ui-kit/src` by hand: sync with `scripts/dev/sync-ui-kit.sh <commit>`; the
   pre-commit gate `npm run check:ui-kit-snapshot` (`.husky/pre-commit`) fails on any byte that
   differs from the pinned upstream commit (it skips with a warning when the upstream clone,
   `UI_KIT_CLONE` or `_references/cheaper-inference-ui-kit`, is absent). When the kit lacks something,
   work around it in the adapter or the screen and ask upstream for it.
3. Kit text defaults are English (`label = "Loading"`, `loadingLabel = "Loading table"`…) — pass translated
   strings from `useTranslations(...)` whenever a kit component renders text.
4. Tailwind utilities win over kit component classes (the kit declares
   `@layer theme, base, components, utilities` and its rules live in `components`) — use utilities for
   spacing and layout, not to re-color kit components.
5. Headings: `.ci-heading` (Geist) for page and section titles; `.ci-dashboard-display` (Geist,
   semibold) only for large, sparse display text such as the error-page status code.
6. `tests/unit/dashboard-kit-sweep.test.ts` guards the kit adoption: no Material ligature span under
   `src/app` or `src/shared/components`; in the dashboard tree (`src/app/(dashboard)` and
   `src/shared/components`) no raw `<select>`, `<textarea>` or `<table>` and no hand-rolled
   `role="dialog"` outside the listed exceptions (the `Select` adapter's native branch,
   `RequestLoggerDetail`); every raw `<button>` or `<input>` there needs a comment containing
   `kit-exception:` (with the reason) ending at most 3 lines above it; palette hues and `dark:` variants
   only in the files the test lists.
7. Verify both themes and the 390 px viewport before a PR (screenshots); `tests/e2e/a11y.spec.ts` runs
   axe.

## 3. Adding a screen

1. Open the page with the kit `PageHeader` (`@omniroute/ui-kit/page-header`, `compact` inside the
   dashboard) — title, description and `actions`. The shell header then drops its own title.
2. Build controls from `@/shared/components` (the adapters) and use kit components by subpath where no
   adapter exists (`Table`/`TableScrollArea`/`DataTableShell`, `Field`, `Alert`, `Tabs`, `RadioGroup`,
   `Slider`…).
3. Icons: `<Icon name="…" />`. A new name goes into `ICON_MAP` with the semantically matching Lucide
   component; `npm run gen:icon-map` lists the names still missing.
4. Colors: semantic utilities (`text-success`, `bg-warning-bg`, `border-border`…) and
   `var(--color-chart-N)` for chart series; no hex values and no `dark:` variants that only repeat a color.
   Orange (`text-fallback`, `bg-fallback`) only for fallback / recovered-request data.
5. Layout patterns: a KPI row is `KpiStrip` + `KpiCell` (`src/shared/components/KpiStrip.tsx`: one
   bordered card split by hairlines; 13 px muted label, 28/600 tabular value, 12.5 px footnote). A settings
   page stacks `SettingsSection`s (`src/app/(dashboard)/dashboard/settings/components/SettingsSection.tsx`:
   a 16/600 `h2` and muted description above one bordered card) holding `SettingsRow`s (label and
   description left, control right, hairline between rows). Each settings card keeps its own save
   button; there is no page-level save bar.
6. Text: every string, including the labels you pass to kit components, comes from `useTranslations`. New
   keys go into `src/i18n/messages/en.json`, `pt-BR.json` and `vi.json` (the Vietnamese parity test pins
   every English key); the other locales are filled by the i18n sync.
7. Run the guards before the PR: `tests/unit/dashboard-kit-sweep.test.ts`,
   `tests/unit/icon-map-coverage.test.ts`, `tests/unit/icon-map-object-values.test.ts`,
   `npm run check:dashboard-typecheck` (the only check that catches a duplicated import in `iconMap.ts`),
   `npm run check:ui-icu`, and the screen's own tests.

## 4. Adding or changing an adapter

1. Keep the public API of `src/shared/components/index.tsx`: same export names, default exports and
   accepted props. Map legacy props onto the kit inside the adapter (see `Button.tsx`: `VARIANT_TO_KIT`,
   `SIZE_TO_KIT`).
2. Import the kit by subpath (`@omniroute/ui-kit/<component>`).
3. Workarounds for kit gaps live in the adapter (or in `globals.css` `@layer components` when the fix is a
   style), never in `packages/ui-kit/src`.
4. Add or update `tests/unit/ui/adapters/<name>.test.tsx`. For an adapter with many callers, compare the
   rendered markup before and after the change — padding or wrapper changes spread to every screen.

## 5. Updating the kit

`scripts/dev/sync-ui-kit.sh <commit> [clone]` copies the upstream `src/` at that commit into
`packages/ui-kit/src` and applies the single allowed transformation (it drops the `.js` suffix from
relative imports). Then: review `git diff packages/ui-kit`, do a visual pass on providers, settings, combos,
usage and endpoint in both themes, run `npm run check:ui-kit-snapshot` and `npm run test:vitest:ui`, and
open the PR with the upstream changelog.

## 6. Reference index

- `src/app/globals.css` — `--r67-*` palette, token bridge, `.dark` overrides, 67router `@layer components` extensions
- `packages/ui-kit/UPSTREAM.md` — pinned upstream commit and license authorization; `packages/ui-kit/PATCHES.md`
- `packages/ui-kit/src/ci-tokens.css`, `packages/ui-kit/src/ci-ui.css`, `packages/ui-kit/src/keak-brand.tsx`
- `src/shared/components/index.tsx` and the adapters next to it; `src/shared/components/layouts/DashboardShell.tsx`,
  `src/shared/components/Sidebar.tsx`, `src/shared/components/Header.tsx`, `src/shared/components/CommandPalette.tsx`
- `src/shared/components/Icon.tsx`, `src/shared/constants/iconMap.ts`, `scripts/dev/gen-icon-map.mjs`,
  `scripts/dev/codemod-material-icons.mjs`
- `src/shared/components/OmniRouteLogo.tsx`, `src/shared/constants/keakProducts.ts`
- `src/shared/components/KpiStrip.tsx`, `src/app/(dashboard)/dashboard/settings/components/SettingsSection.tsx`
- `src/store/themeStore.ts`, `src/shared/constants/appConfig.ts`, `src/shared/constants/statusColors.ts`
- `tests/unit/design-kit-bridge.test.ts`, `tests/unit/dashboard-kit-sweep.test.ts`,
  `tests/unit/icon-map-coverage.test.ts`, `tests/unit/icon-map-object-values.test.ts`,
  `tests/unit/brand-pages-static.test.ts`, `tests/unit/ui/adapters/*.test.tsx`
