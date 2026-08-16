## Unreleased

> Requires `langsys-js-typescript` **0.5.0**, which is not yet published. The
> dependency range here still reads `^0.4.1`, so this section does not describe a
> releasable state — bump the range and re-verify against the registry tarball
> before releasing.

### Added

- **Write gating (ticket 838).** Public keys are read-only; the server decides per session whether it may register content, and read-only sessions report the page URL only (never phrase content) so Langsys can visit and register from an allow-listed address.
  - **`useWriteEnabled()`** → `boolean | undefined`. Tri-state, and the states are distinct: `undefined` means authorization hasn't landed (and is the value throughout SSR), `false` means read-only, `true` means this session registers directly. Don't collapse it to a boolean or default `undefined` to `false`.
  - **`setWriteGrant(grant)`** → `Promise<void>`, also on `LangsysApp`. For login-walled apps: supply a short-lived JWT after `init()` and the session is re-authorized with an `X-Write-Grant` header. It re-authorizes rather than only storing the token.
  - **`writeGrant`** init option, inherited from the base config type. Prefer the function form — grants are short-lived and a static string expires while the app is still mounted.
  - **`writeEnabled`** raw signal and the **`WriteGrant`** type re-exported.
- **E2E testbed** (`example/Testbed.tsx` + `example/e2e/write-gating.mjs`, `npm run test:e2e`) — drives a real browser against a live API and asserts on captured request payloads *and* response status.

### Fixed

- **`useWriteEnabled()` hydration safety.** It pins `getServerSnapshot` to `undefined` rather than reusing the live signal getter. React uses that snapshot for the hydration render as well as the server render, so reading the live value there makes a session whose authorization resolved before hydration render markup disagreeing with the server HTML, and React discards the subtree.

## 0.4.1 - 2026-07-08

### Changed

- **Base SDK bumped to `langsys-js-typescript@^0.4.1`** — adds the compile-safe `%key%` markup placeholder spelling.
- **`<Translate>` / `<Phrase>` docs now use `%count%` placeholders** instead of the `{'{count}'}` JSX escape. A bare `{key}` in JSX is a JavaScript expression React evaluates before the SDK's DOM walker sees the text, silently breaking interpolation; `%key%` passes through as literal text and the SDK normalizes it to canonical `{key}` at capture — so translators and the catalog still only ever see `{key}`, and both spellings share the same content-block id. Keys are identifier-shaped (`%[A-Za-z_][A-Za-z0-9_]*%`), so a stray `%` in prose is untouched; an unknown `%key%` renders as `{key}`. `t()` and the hooks keep `{key}` (JS strings, no collision). The prior brace-collision warning is replaced with `%key%` guidance. No wrapper API change — the normalization lives in the base SDK tokenizer the components already delegate to.

### Added

- **`example/` params demo** — a `<Translate params>` card using `%count%` with +/− buttons, showing the block re-render via `setParams` on param change.

## 0.4.0 - 2026-07-08

### Added

- **`<Translate params>`** — the React `<Translate>` component now accepts a `params?: Record<string, ParamPrimitive>` prop for `{key}` interpolation (same single-brace syntax as `t()`), mirroring the base SDK's new `TranslateOptions.params` / `Translate.setParams`. Params are applied to the resolved text of content-block nodes, translatable attributes, `<option>` text, and single-token content (untranslated fallbacks included); Number/Date values get CLDR locale formatting. Changing `params` after mount re-renders the block. Brings `<Translate>` to parity with `<Phrase>` and the Svelte wrapper.

### Changed

- **Base SDK bumped to `langsys-js-typescript@^0.4.0`** (adds `TranslateOptions.params` + `Translate.setParams`).

## 0.3.0 - 2026-07-03

### Changed

- **Base SDK bumped to `langsys-js-typescript@^0.3.0`** (CLDR compliance, matching the backend migration). No public signatures changed, but behavior did:
    - Locale identifiers are canonicalized to BCP 47 everywhere (`en-us` → `en-US` on the wire, in cache keys, and in `currentlyLoadedLocale` / `useCurrentLocale()` emissions). Lowercase input still works.
    - `detectPreferredLocale` matching is script-aware via CLDR likely-subtags (`zh-TW` matches `zh-Hant`, never falls back to `zh-Hans`) and returns canonical identifiers.
    - `{name}` interpolation now locale-formats `number` params via `Intl.NumberFormat` and `Date` params via `Intl.DateTimeFormat` (medium date style; previously ISO 8601). String values opt out. Formatting uses the catalog locale, never the host default, so SSR and client output match.
    - Style-less ICU arguments (`{n, number}`, `{d, date}`, `{t, time}`) now format instead of rendering literally.
- **`createLocaleStore` / `useLocaleStore` default is now `'en-US'`** (was `'en-us'`). If you relied on the default and compare the store value against `'en-us'`, update the comparison — or pass an explicit initial value.

### Added

- **`canonicalizeLocale(locale)`** re-export — normalize a locale identifier to canonical BCP 47 the same way the SDK does, for comparing your own values against `useCurrentLocale()` / `detectPreferredLocale()`.

## 0.2.0 - 2026-06-11

### Added

- **`<Phrase>`** — React component wrapping the base SDK's vanilla `Phrase` rich-text handler. Keeps a markup-bearing run as ONE translatable phrase (so a count variable stays next to the noun it pluralizes), encoding inline markup as neutral tokens and reconstituting the real framework-owned elements at render. Props: `category?`, `params?`, `tag?` (default `span`), `className?`, `children`. Brings the React SDK to parity with `langsys-js-svelte`.
- **`<DontTranslate>`** — marks a region as never-translated (renders `translate="no"` + `data-ls-dont-translate`, both already honored by the base SDK tokenizer/renderer), preserved verbatim. Props: `tag?` (default `span`), `className?`, `children`.

## 0.1.0 - 2026-05-29

Initial release. `langsys-js-react` is a thin React binding over the framework-agnostic [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript) package — the React sibling of `langsys-js-svelte`. The base SDK owns the API client, translation lifecycle, token discovery, DOM tokenizer, and SSR-aware token strategies; this package adds only the React-native concerns.

### Added

- **`LangsysApp`** — wrapper whose `init` accepts a `Signal<string>` as `UserLocaleStore` and delegates every other method to the base SDK singleton.
- **Hooks** built on `useSyncExternalStore`:
    - `useT()` — returns the current `TFunction`; re-renders the component whenever translations or the loaded locale change. Signature `t(phrase, category?, params?)`.
    - `useCurrentLocale()` — the locale whose translations are currently loaded.
    - `useTranslations()` — the raw translation catalog.
    - `useLocaleStore(initial?)` — creates one stable user-locale `Signal<string>`, reads it reactively, and returns `[locale, setLocale, store]`.
    - `useSignal(signal)` — low-level bridge from any base-SDK `Signal<T>` to a reactive value.
- **`createLocaleStore(initial?)`** — make a user-locale store outside React (the analog of Svelte's `writable`).
- **`<Translate>`** — React component wrapping the base SDK's vanilla DOM `Translate` class via a ref + mount/destroy effect. Props: `category?`, `custom_id?`, `label?`, `tag?` (default `translate`), `className?`, `children`.
- **Raw signal re-exports** — `t` (the base SDK's `tSignal`), `currentlyLoadedLocale`, `sTranslations`, plus `createSignal`, for direct subscription outside React.
- **`{name}`-style placeholder interpolation** with compile-time-checked params via template-literal types. Allowed value types: `string | number | Date | boolean`; `Date` serializes to ISO 8601.
- **Type re-exports** sourced from `langsys-js-typescript`: `TFunction`, `TranslationParams`, `ParamPrimitive`, `ExtractParamKeys`, `ParamsFor`, `TArgs`, `Signal`, `iLangsysInitConfig` (React-flavored), `iLangsysResponse`, `iCategories`, `iTranslations`, `iContentBlock`, `iCountry`, `iCountryDialCode`, `iCountryList`, `iCurrency`, `iCurrencyList`, `iLanguageName`, `iLocaleData`, `iLocaleDefault`, `iLocaleFlat`, `iProject`.
- **`LangsysAppAPI`** re-export for direct (vanilla) API access.
- **`README-SSR.md`** documenting Next.js App Router and Pages Router usage.
- **`example/`** — a Vite playground (`npm run dev`) demonstrating `useT`, interpolation, categorization, locale switching, and `<Translate>`.

### Tooling

- Built with `tsup` (ESM + CJS + `.d.ts`), matching `langsys-js-typescript`.
- `react` (`^18 || ^19`) is a peer dependency.
- CI (`typecheck` + `test`) and trusted-publishing release workflow mirror the Langsys SDK family.
