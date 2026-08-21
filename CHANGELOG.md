
## 0.6.7 - 2026-08-21

### Docs

- `%key%` guidance now names the expensive consequence, not just the mechanism. A bare `{key}` in JSX is evaluated before the SDK's walker runs, so the *value* is captured as part of the phrase and **every distinct value hashes to its own content block** — a `<Translate>` around a live counter mints a catalog entry per tick while rendering correctly in the base locale throughout. Previously documented only as "interpolation silently breaks". Verified against the shipped `tokenizeElement`/`generateCustomId`. README and `<Translate>` JSDoc.
- Same gap closed in `<Phrase>`'s JSDoc, which reaches a different identity path and needed its own measurement: `<Phrase>` keys on the encoded phrase string from `encodeRichText`, not on a token array, so a substituted value becomes part of the key directly (`"Based on 0 {m0o}reviews{m0c}"` per value, versus a stable `"Based on {n} {m0o}reviews{m0c}"`). Same outcome, different mechanism. JSDoc matters more than usual here — it ships in `dist/` and is what IDE hover renders, so for anyone who never opens the README it *is* the documentation.

## 0.6.6 - 2026-08-16

### Changed

- **Base SDK bumped to `langsys-js-typescript@^0.6.5`** — adds a debug-mode warning when a locale tag isn't valid BCP 47. Relevant here because the locale you set via `useLocaleStore` / `createLocaleStore` is exactly what reaches that check. `canonicalizeLocale` still falls back to best-effort casing rather than throwing, so behavior and return values are unchanged and it's silent in production — but a typo'd tag (`'en-USA'`, `'eng'`) previously degraded to a failed catalog lookup that renders base language, which is indistinguishable from a locale that simply has no translations yet. The warning fires where that distinction still exists.

### Docs

- **README shields standardized** under the H1, matching the other Langsys SDKs. Two defects in the previous block are fixed: the license badge queried `npm/l/all-contributors` — a *different package's* license, which rendered "MIT" correctly while reporting someone else's — and four of five badges had empty link targets that navigated nowhere. Both were invisible to inspection, since a badge is checked by looking at it and neither the wrong query nor the dead link changes how the row looks.

## 0.6.5 - 2026-08-16

### Fixed (documentation)

- **`<Translate>`'s attribute-harvesting docs were wrong in two ways.** No behavior change — the SDK always did the right thing; the README under-described it. Verified against the published `langsys-js-typescript@0.6.4` bundle.
    - **The attribute list named 4 of the 15 harvested.** Missing were `label`, four more ARIA strings (`aria-placeholder`, `aria-description`, `aria-valuetext`, `aria-roledescription`), and six `data-*` validation messages. The ARIA omissions mattered most: those strings are invisible on the page, so nobody notices they *are* translated — or would notice if they weren't.
    - **"button/input `value`" over-promised.** `value` is translated on `<button>` and on `<input type="submit">` / `<input type="button">` — and no other input type. The exclusion is deliberate: `value` is translated where it's a *label* and left alone where it's *data*, so a text field's value is never rewritten. The old wording implied the SDK would mangle what a user typed.

  The line was inherited from a shared ancestor by all three framework bindings; Svelte and Vue fixed theirs before publishing, and the Vue agent flagged that this package had shipped it.

## 0.6.4 - 2026-08-16

### Fixed

- **Base SDK bumped to `langsys-js-typescript@^0.6.4` — fixes raw ICU message source rendering to the page.** Unlike the recent bumps, this one changes what your users see. When an ICU argument was missing, the base SDK fell back to the simple `{key}` interpolator, whose pattern deliberately can't match an ICU slot — so the entire construct passed through untouched:

  ```
  before: {name_gender, select, male {Bienvenido} female {Bienvenida} other {Bienvenide}} Sarah
  after:  Bienvenide Sarah
  ```

  **This is reachable without any mistake on your part**, which is why it's worth upgrading for: langsys-ai's ICU promoter can *introduce* a `select` argument the source phrase never had — a plain `%name%` / `{name}` becomes `{name_gender, select, …}` in gendered target locales. Your app can't supply `name_gender`, because it doesn't exist in the phrase you wrote and nothing tells you the translation grew one. Any React app translating into a gendered locale could hit this, through either `t()` or `<Translate params>` / `<Phrase params>`.

  Recovery is aligned with `langsys-php` so a shared catalog can't render two different sentences: a missing `select` argument takes the `other` branch (a correct sentence — `other` is what an unknown gender should render), and a missing `plural` argument takes `other` with `#` rendered as `{count}` (nothing can be inferred for a count, so the sentence survives with a visible gap).

- **A `null` param now counts as missing rather than coercing to `0`.** Previously `{count, plural, …}` with `count: null` rendered `0 items` — identical to a genuine `count: 0`, so a failure to pass the value and an empty cart produced the same string on screen, in screenshots, and in bug reports. A real `0` still renders `0 items`; only `null` now takes the recovery path.

## 0.6.3 - 2026-08-16

### Changed

- **Base SDK bumped to `langsys-js-typescript@^0.6.3`** — fixes `<select>` option text being harvested twice by the tokenizer. Inherited; no wrapper API change.

  **What this means if you put a `<select>` inside `<Translate>`** (which this README documents as a supported pattern — `<option>` text is harvested):
    - **Content without a `<select>` is unaffected** and does not rebase.
    - **Affected blocks re-key**, because the token list feeds the `custom_id`. Migration is automatic and lookup-only: the base SDK tries the corrected id, then the 0.6.0–0.6.2 id, then the pre-0.6.0 legacy id, and always *registers* the corrected one — so the older keys only shrink and nothing loses its translations.
    - **If you render with `langsys-php` and hydrate with this SDK**, affected blocks may appear to *gain* translations after upgrading. That's expected: the ids previously diverged from PHP's and now converge on them, so blocks PHP had already translated start resolving here.

## 0.6.2 - 2026-08-16

### Changed

- **Base SDK bumped to `langsys-js-typescript@^0.6.2`** — cross-SDK exclusion fixes, inherited with no wrapper API change. `data-notrans` (langsys-php's author-facing alias for `translate="no"`) is now honored, so on SSR handoff content an author marked do-not-translate isn't harvested by whichever SDK walks the DOM first; `translate="no"` is matched case-insensitively; and phrase-marker values are trimmed to match a normalization on the PHP side.

### Fixed (documentation)

- **`<DontTranslate>` docs corrected.** The 0.2.0 entry claimed `translate="no"` and `data-ls-dont-translate` were "both already honored by the base SDK" — only the first is. Checked against every published base version from 0.1.0 through 0.6.2: `data-ls-dont-translate` appears nowhere in the SDK runtime and never has. **No behavior change and nothing to do** — the component always worked, because exclusion rests on `translate="no"`, which is honored (now case-insensitively). `data-ls-dont-translate` is a wrapper-level styling/debugging hook; it keeps being emitted so existing CSS selectors don't break, and is now documented as such in the component.

## 0.6.1 - 2026-08-15

### Changed

- **Base SDK bumped to `langsys-js-typescript@^0.6.1`** — completes the `langsys-php` SSR interop from 0.6.0. `data-langsys-phrase="false"` and `="0"` are explicit author opt-outs, but 0.6.0 matched on attribute *presence* alone, so an author who deliberately un-marked a subtree got it skipped by this SDK and un-translated by PHP too — content translated by neither. No wrapper API change; inherited through the base SDK.

## 0.6.0 - 2026-08-15

### Changed

- **Base SDK bumped to `langsys-js-typescript@^0.6.0`.** No wrapper API change; both fixes are inherited through the base SDK classes these components delegate to.
    - **`custom_id` correctness** — the base `md5` packed UTF-16 code units into byte lanes, so it only matched a real MD5 for ASCII. Non-ASCII content diverged from `langsys-php` and could rarely collide with itself. Pure-ASCII ids are byte-identical to before, so **only non-ASCII content blocks rebase**, and migration is automatic and lookup-only: the corrected id is tried first with the legacy id as fallback, and registration always writes the corrected id.
    - **SSR handoff with `langsys-php`** — the tokenizer now recognises PHP's `data-langsys-phrase` keep-together marker alongside our `data-ls-phrase`. Previously, on a DOM walked by both SDKs, ours recursed into subtrees PHP had kept whole and **split phrases at tag boundaries** — the exact failure `<Phrase>` exists to prevent.

### Internal

- `<Phrase>` now emits its marker via the base SDK's exported `PHRASE_MARKER_ATTR` instead of a hardcoded `'data-ls-phrase'` string. Rendered output is byte-identical (covered by the existing component test); this removes the chance of silent drift if the marker is ever renamed upstream.

## 0.5.0 - 2026-08-14

### Breaking (compile-time only)

- **`<Phrase params>` no longer accepts non-primitive values.** `PhraseProps.params` narrows from `Record<string, unknown>` to `Record<string, ParamPrimitive>` (`string | number | Date | boolean`), matching `<Translate params>` and `t()`. **If you pass an object, array, or function as a param value, it stops compiling** — e.g. `params={{ user: someUser }}`. That code was already rendering `[object Object]` at runtime, so this surfaces a latent bug rather than causing one, but it surfaces at build time. Pass the primitive you actually want interpolated (`params={{ name: user.name }}`). Code that *forwards* a `Record<string, unknown>` into the prop also needs its own type narrowed. Runtime behavior is unchanged.

### Changed

- **Base SDK bumped to `langsys-js-typescript@^0.5.0`**, which narrows `PhraseOptions.params` the same way and adds `undefined` to `Phrase.setParams()` (no effect here — this wrapper always passes its defaulted `{}`). 0.5.0 also documents the `Phrase` class in the base README for the first time, plus the `<Translate>` per-text-node splitting caveat and a template-literal catalog-pollution warning.

## 0.4.3 - 2026-08-08

### Changed

- **Base SDK bumped to `langsys-js-typescript@^0.4.3`** — corrects the debug diagnostic's wording to be framework-neutral (it previously hardcoded "the framework compiler (Svelte/JSX)" and the `{key}` spelling, which misdiagnosed Vue's `{{ key }}`). Behavior is unchanged; React users just get clearer text. The README's quotation of the warning elides that sentence, so no doc change was needed.

## 0.4.2 - 2026-08-08

### Changed

- **Base SDK bumped to `langsys-js-typescript@^0.4.2`** — adds a debug-mode diagnostic that catches a mistaken bare `{key}` in `<Translate>`/`<Phrase>` JSX markup: if `params` keys match no placeholder in the captured content, the SDK warns and names the fix (`write %count% instead`). Silent in production, treats ICU slots as legitimate, and only re-warns when the param key-set changes. Documented in the README `%key%` guidance. No wrapper code change — the components inherit it through the base SDK.

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

## 0.2.1 - 2026-06-24

> Reconstructed from git history on 2026-08-15 — this release shipped without a changelog entry.

### Changed

- **Base SDK range bumped to `langsys-js-typescript@^0.2.2`** (from `^0.2.0`). No React wrapper API change. What that picked up:
    - *base 0.2.1* — migration off deprecated API routes (reads via `GET /translations`, writes via `POST /translatable-items` with a unified body); missing-phrase registration now chunks into batches of 200.
    - *base 0.2.2* — SSR-only fix: switching **back** to the initial/SSR locale left the previous language on screen, because every return to the initial locale skipped the store updates that rebuild the `t` signal.
    - Because `^0.2.2` also admits later 0.2.x patches, installs of this release resolve *base 0.2.3* as well — an SSR-only fix where `ready()` never settled on a seeded catalog. In this wrapper that presented as `<Translate>` / `<Phrase>` mounting but never rendering a translation on an SSR-seeded page.

### Tooling

- CI and publish workflows moved to Node 24 (`checkout@v4→v5`, `setup-node@v4→v5`), clearing the Node 20 runtime deprecation warnings.
- Corrected the npm-bundling comment in `publish.yml`: Node 24 ships npm 11.3.x, still below the 11.5.1 floor for OIDC trusted publishing.

## 0.2.0 - 2026-06-12

### Added

- **`<Phrase>`** — React component wrapping the base SDK's vanilla `Phrase` rich-text handler. Keeps a markup-bearing run as ONE translatable phrase (so a count variable stays next to the noun it pluralizes), encoding inline markup as neutral tokens and reconstituting the real framework-owned elements at render. Props: `category?`, `params?`, `tag?` (default `span`), `className?`, `children`. Brings the React SDK to parity with `langsys-js-svelte`.
- **`<DontTranslate>`** — marks a region as never-translated (renders `translate="no"` + `data-ls-dont-translate`, both already honored by the base SDK tokenizer/renderer), preserved verbatim. Props: `tag?` (default `span`), `className?`, `children`.
    > **Correction (2026-08-16):** "both already honored" was wrong — only `translate="no"` is honored by the base SDK, and `data-ls-dont-translate` never was, in any version. The component has always worked, because `translate="no"` carries it. See the 0.6.2 entry.

## 0.1.0 - 2026-06-11

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
