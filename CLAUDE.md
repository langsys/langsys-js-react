# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`langsys-js-react` is a React binding over the framework-agnostic [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript) package. The base SDK owns the API client, translation lifecycle, token discovery, DOM tokenizer, and SSR-aware token strategies. This package is intentionally thin and contains only React-native concerns.

It is the React sibling of [`langsys-js-svelte`](https://github.com/langsys/langsys-js-svelte) and exposes the same capabilities, adapted to React idioms: where Svelte uses `$store` auto-subscription, React uses hooks built on `useSyncExternalStore`.

## Layout

```
src/
    server.ts                 # langsys-js-react/server (node-only, no React): renderInRequestScope over the core's request scope (SRV-7); also exports LangsysApp + createLocaleStore
    app.ts                    # LangsysApp (core singleton by reference, init typed), iLangsysInitConfig, createLocaleStore — imports no React, shared by both entries
    transform/                # build-time only: the VAR-6 placeholder transform (babel.ts, naming.ts per VAR-2, run.ts), Vite plugin (vite.ts)
    next.ts, next-loader.ts   # langsys-js-react/next: withLangsys(nextConfig) adds the transform as a Turbopack rule + webpack pre-loader
    index.ts                  # public exports — LangsysApp (from app.ts), hooks, Translate, raw signals, type re-exports
    adapters.ts               # useSignal (Signal → useSyncExternalStore) + createLocaleStore (the writable analog)
    hooks.ts                  # useT / useCurrentLocale / useTranslations / useLocaleStore / useWriteEnabled / useNotifyNavigation / useRenderServerMessage
    block-nodes.ts            # React children <-> the core's BlockNode tree (toBlockNodes / toReactNodes)
    components/               # Translate / Phrase over the core's renderBlock/registerBlock; DOM-class fallback; DontTranslate
    test-helpers/             # contract-fixture launcher; SSR RequestAdapter harness (ssr-scope.ts)
    *.test.ts(x)              # Vitest; *.contract.test.tsx run against contract-fixture/
contract-fixture/             # vendored byte-exact from langsys-js-typescript (tree cited in CONFORMANCE.md) — never edit
vectors/                      # shared vector files (server messages, var naming), vendored byte-exact from langsys-js-typescript — never edit
example/                      # Vite playground (npm run dev; /?checks=1 is the feature-checks page) and the contract-double launcher (npm run fixture) — not published
example-next/                 # Next.js App Router app installing the packed package and core — not published
```

That's the entire surface. Every other concern — HTTP, missing-token registration, persistence, SSR strategies, lookup/interpolation logic — lives in `langsys-js-typescript`.

## How the wrapping works

The Svelte wrapper adapts a native store *into* the SDK (`writable` → `Signal`). The React wrapper does the mirror image: it adapts the SDK's signals *out* to React's render cycle, and supplies a `Signal`-shaped locale store on the input side.

1. **`LangsysApp.init({ UserLocaleStore })`** — `LangsysApp` is the base SDK's singleton re-exported **by reference** (not a wrapper class), with `init` typed to take a `Signal<string>`. Because React's locale store is already a `Signal`, `init` is a straight passthrough. See the reasoning at the export site in `src/app.ts`.

2. **Hooks (`useT`, `useCurrentLocale`, `useTranslations`)** — each wraps a base-SDK signal with `useSignal`, which is `useSyncExternalStore(signal.subscribe, signal.get, signal.get)`. The base SDK's `tSignal` re-emits a fresh `TFunction` closure on every translations/locale change (and a stable reference between changes), which is exactly the identity contract `useSyncExternalStore` needs — no tearing, no render loops. `useT()` returns the current `TFunction`; calling `t('Phrase', 'Cat', params?)` reads the current translation and the component re-renders when the signal changes.

3. **`useLocaleStore(initial)`** — lazily creates one stable `Signal<string>` (via `useState(() => createLocaleStore(...))`), subscribes to it with `useSignal`, and returns `[locale, setLocale, store]`. Pass `store` to `init`; drive the locale with `setLocale`.

4. **`<Translate>` / `<Phrase>`** — `toBlockNodes(children)` maps host elements and text to the core's `BlockNode` tree; `renderBlock` returns the translated tree, the block's id and host markers, synchronously, from the active catalog (a request scope's or the page's); `toReactNodes` clones the original React elements into the positions the translation gives them (`source`), so handlers, refs and keys survive reordering. `registerBlock` registers with no DOM: in an effect keyed on `t` on the client (one-shot, with `host` for GATE-10's ancestor walk), during render inside a request scope. `<DontTranslate>` maps to the host element it renders. Content holding any other component, `lazy`, `Suspense` or `dangerouslySetInnerHTML` falls back to the core's DOM class after mount, stamps an explicit `custom_id`, warns once on a server (`warnUnrenderedBlock`), and a tree-rendered block nested in it registers itself with `registerBlock(…, { host })`, which claims its host, so the fallback's walk leaves it alone instead of taking it over with the outer block's params.

## Public API

```typescript
// Main entry point — the base SDK singleton re-exported BY REFERENCE (not a wrapper);
// `init` is typed to take a Signal<string>. Nothing is delegated, so nothing can be missed.
LangsysApp.init({ projectid, key, UserLocaleStore, baseLocale?, debug?, ssrTokenStrategy?, initialTranslations?, initialTranslationsLocale? })
LangsysApp.t                     // current TFunction (snapshot — not reactive on its own; use useT())
LangsysApp.getCountries() / getCurrencies() / getDialCodes() / getLocales*() / ...
LangsysApp.detectPreferredLocale(acceptLanguageHeader?, supportedLocales?)
LangsysApp.refresh()
LangsysApp.translationsLoadingPromise

// Hooks (the reactive layer)
useT()                  -> TFunction        // re-renders on translations/locale change; t(phrase, category?, params?)
useCurrentLocale()      -> string           // loaded locale (lags UserLocaleStore until fetch settles)
useTranslations()       -> iCategories      // raw catalog
useLocaleStore(initial?) -> [locale, setLocale, Signal<string>]
useWriteEnabled()       -> boolean | undefined  // server-decided write capability; TRI-STATE, see below
useNotifyNavigation(loc) -> void           // calls notifyNavigation() when the router's location changes (HINT-13)
useRenderServerMessage() -> (entry, category?) => string  // core renderServerMessage, identity tied to useT() (MSG-5)
useSignal(signal)       -> T               // low-level Signal → value bridge

// Store factory + raw signals (advanced / direct subscription)
createLocaleStore(initial?)  // Signal<string> — the writable analog
t, currentlyLoadedLocale, sTranslations  // raw Signals; prefer the hooks in components
createSignal                 // re-exported generic Signal factory
localeHeaders()              // re-exported by reference (FRM-6): { 'Accept-Language': current locale } for the app's own API calls
canonicalizeLocale(locale)   // re-exported BCP 47 normalizer — LOWERCASES ('en-US' → 'en-us'), per WIRE-3; the SDK canonicalizes all locale input since base 0.3.0
interpolate(text, params, locale)  // re-exported pure helper (ICU included) for where hooks can't run; the core is a dependency, not a peer, so importing it directly breaks under pnpm / Yarn PnP

// Write gating (ticket 838; requires the unreleased base SDK build that carries it)
// NOTE: the raw `writeEnabled` signal is deliberately NOT re-exported — see the
// reasoning at the export site in src/index.ts, pinned by write-enabled-surface.test.ts.
// Access it through useWriteEnabled(); advanced consumers can import the raw signal
// from langsys-js-typescript directly.
notifyNavigation()           // re-exported by reference; a route change re-enters mounted translated nodes (HINT-13)
resolveServerMessages(body, {key | resolver, pieces?}) / renderServerMessage(entry, category?)  // by reference (MSG-1, MSG-5); key or resolver is required — no default body search
DEFAULT_SERVER_MESSAGE_CATEGORY  // by reference; types ServerMessage, ResolveServerMessagesOptions, ServerMessagePieces
messagesCategory             // init option, inherited from the base config type (default 'Errors', MSG-6)
LangsysApp.loadSnapshot(snapshot, locale?)  // core's synchronous loader, by reference (SNAP-2/3); SnapshotError + CatalogSnapshot re-exported
legacyKeys                   // init option, inherited: legacy-key mode (MIG); LangsysApp.Translations.setLegacyKeys(files|null); LegacyFormatError + LegacyKeyFile re-exported
setWriteGrant(grant)         // Promise<void> — re-authorizes with an X-Write-Grant header; also LangsysApp.setWriteGrant
writeGrant                   // init option, inherited from the base config type: string | (() => string | null | undefined | Promise<…>)
requireCredentials           // init option, inherited (WIRE-4): unconfigured client → t() throws, a block's registerBlock promise rejects (left unhandled on purpose); off → source text, 'not-configured'
LangsysApp.isConfigured()    // core's, by reference; LangsysConfigurationError re-exported by reference from both entries

// Server entry — langsys-js-react/server (node-only; imports node:async_hooks)
renderInRequestScope({locale, catalog?, url?}, render) -> { result, seed, close }  // one request, one core scope
LangsysApp, createLocaleStore  // the main entry's, from app.ts: loads no React, so a Server Component calls init() here; a scope fetches with init()'s project and key
installRequestScopeStorage()  // AsyncLocalStorage for the core; then createRequestScope + scope.enter() where a render can't be wrapped
createRequestScope, currentRequestScope, setRequestScopeStorage, clearSharedCatalogs  // core, by reference

// Build-time transform (VAR-6) — interpolations in <Translate>/<Phrase>/t() become named placeholders + params (VAR-2 names)
langsys-js-react/vite        // default export: langsys() Vite plugin, enforce 'pre', only files importing the package
langsys-js-react/babel       // default export: the Babel plugin
langsys-js-react/next        // withLangsys(nextConfig): the transform in Turbopack (rules, not foreign, content-filtered) and webpack (enforce 'pre'); SWC stays on

// Component
<Translate category? custom_id? label? tag? className? children />
<LangsysProvider seed>       // Next App Router: rebuilds the request scope from scope.seed() on the client-component side (core scopeFromSeed); hooks and Translate/Phrase read it for the server + hydration renders; seeds the browser in useInsertionEffect

// Direct API client access (vanilla — no React concerns)
LangsysAppAPI

// Types — all sourced from langsys-js-typescript, re-exported for ergonomic imports
iLangsysInitConfig (the React-flavored one — UserLocaleStore is Signal<string>)
iLangsysResponse, iCategories, iTranslations, iContentBlock, iCountry, iCountryDialCode, iCountryList,
iCurrency, iCurrencyList, iLanguageName, iLocaleData, iLocaleDefault, iLocaleFlat, iProject,
TFunction, TranslationParams, ParamPrimitive, ExtractParamKeys, ParamsFor, TArgs, Signal
```

> Note on the `t()` signature: it is **`t(phrase, category?, params?)`** — phrase first. (The base SDK's `TFunction` type and the Svelte demo agree on this; some older Svelte README prose showed category-first, which was doc drift.)

## Essential commands

- `npm run fixture` — starts the contract double on :8787, seeded from `example/fixture-seed.json`. `TESTING.md` is the local testing guide (playground feature checks and `example-next/`).
- `npm run dev` — Vite dev server with the demo in `example/`. Needs `.env` at the repo root with `VITE_LANGSYS_PROJECT_ID` and `VITE_LANGSYS_API_KEY` (see `.env.example`).
- `npm run typecheck` — `tsc --noEmit`. Should be clean before any commit. (This is the React analog of the Svelte package's `npm run check`; CI runs it.)
- `npm run build` — `tsup` → builds ESM + CJS + `.d.ts` to `dist/`.
- `npm run test` — Vitest (`vitest run`). Tests are minimal; expand here for new features.
- `npm run lint` / `npm run format` — Prettier + ESLint (flat config in `eslint.config.mjs`). Not run in CI.

## Local development setup

This package consumes `langsys-js-typescript` as a **published npm dependency** — a semver range (`"langsys-js-typescript": "^x.y.z"`) in `package.json`, resolved from `registry.npmjs.org`. That committed form is canonical. **Never commit** a `file:../langsys-js-typescript` link, an `npm link`, or an `overrides`/`resolutions` redirect: a stale local build silently shadowing the real package has burned us before, and the committed lockfile must always pin the registry tarball (`resolved: https://registry.npmjs.org/…tgz`).

To pick up base-SDK changes, publish the base SDK first, then bump the range here:

```bash
# in ../langsys-js-typescript: cut a release (npm publish via its CI), then back here:
npm install langsys-js-typescript@^x.y.z   # bumps the range AND re-pins the lockfile
npm run typecheck                          # picks up the new types
```

If you must iterate against an *unpublished* base-SDK build, do it as a **temporary, uncommitted** local override (`npm link ../langsys-js-typescript`, or a throwaway `file:` install) and revert it before committing — never `git add` the resulting `package.json` / `package-lock.json` churn. Before publishing, the dep must be a semver range and the lockfile must resolve to `registry.npmjs.org`.

## Release & publishing

Releases are CI-driven via npm **trusted publishing** (OIDC). There is no long-lived npm token anywhere — neither in the repo, in CI secrets, nor on the maintainer's laptop.

The flow:

1. **Local:** `npm run release` (alias for `./_dev_/publish.sh`) — prompts for the new version, bumps `package.json`, stamps the CHANGELOG heading with the release date, amends the last commit with the version bump, force-pushes `main`, creates a tag `vX.Y.Z`, creates a GitHub Release. **It does not publish to npm.**

    > **Write CHANGELOG headings as `## X.Y.Z - unreleased`.** The release script fills in the date immediately before tagging. A heading dated by hand records when it was *typed*, not when it shipped — that silently dated 0.4.2/0.4.3 a month early, and four of this repo's nine entries were wrong before an audit against `npm view langsys-js-react time --json` caught them. The script warns if the version being released has no CHANGELOG section, and prompts before releasing an undocumented version.
2. **CI:** the `release: published` event triggers `.github/workflows/publish.yml`, which runs `npm ci` → `npm run typecheck` → `npm test` → `npm run build` → `npm publish --provenance`. Publishing happens inside the `npm-publish` GitHub Environment so only tag-ref runs can mint the OIDC token.
3. **PR/push gate:** `.github/workflows/ci.yml` runs `typecheck` + `test` on every PR and every push to `main`, independent of the release flow.

The three trust-handshake strings must stay in sync, or CI will fail at the publish step:

- GitHub Environment name: `npm-publish`
- npm trusted publisher config: Environment name `npm-publish`, workflow filename `publish.yml`
- `.github/workflows/publish.yml`: `environment: npm-publish`

## Commit conventions

**Never add trailers to commit messages.** No `Co-Authored-By`, no
`Generated with`, no tool attribution of any kind. The repository owner is the
sole author of record, and a trailer naming anything else is wrong on the face
of it. This applies to every commit in this repo without exception.

## When making changes

- **Do not reimplement base-SDK behavior here.** API client, lookup logic, missing-token flow, persistence, SSR strategies all belong in `langsys-js-typescript`. If you need to extend any of that, the change goes in the base package and we re-export.
- **Keep `<Translate>` and `<Phrase>` rendering through the core.** Identity, tokens, translation and markers come from `renderBlock` / `registerBlock`; the binding only maps React children to nodes and back. Don't fork the tokenizer or decide a marker here.
- **Type re-exports go through `index.ts`.** Consumers shouldn't have to reach into `langsys-js-typescript` for routine types.
- **The hooks' reactivity story** depends on the base SDK re-emitting a fresh `TFunction` closure on every translations/locale change *and* returning a stable reference between changes. If components don't re-render after a locale change, look at the `tSignal` subscriber wiring in `langsys-js-typescript`'s `Translations` class. If you get an infinite render loop, suspect a signal whose `get()` returns a new reference on every call.
- **Keep the locale store stable.** Never call `createLocaleStore()` inside render without memoizing — use `useLocaleStore` or `useState(() => createLocaleStore(...))`.
- **Don't route `writeEnabled` through `useSignal`.** `useWriteEnabled` deliberately calls `useSyncExternalStore` itself with `getServerSnapshot` pinned to a module-level `() => undefined`. React uses that snapshot for the hydration render as well as the server render, and `writeEnabled` is browser-authoritative — so passing the live getter makes a session whose authorization resolved before hydration render markup that disagrees with the server HTML, and React throws the subtree away. This is the one place a binding-authored decision is correct rather than a smell: the *value* still comes from the core, only *when React may read it* is React-specific. Verify any change here by mutation (unpin the snapshot and confirm tests go red), not by a passing test — the tests pass against a broken implementation unless authorization resolves before hydration.
- **Under `<LangsysProvider>`, read the scope only through the server snapshot.** `useSignal`/`useT` pass the seed's scope in `getServerSnapshot`, and components use `useSeedScopeRunner()` (keyed on `useSyncExternalStore`'s server-snapshot window), so the server render and the hydration render read the request's scope and everything after reads the page. Never branch on `typeof window` to decide it.
- **Server state lives in the core's request scope.** `src/server.ts` opens, runs and closes a scope and hands the core an `AsyncLocalStorage`; it keeps no request state of its own. `scope.enter()` holds only in the continuation that itself renders: a function the host awaits and returns from (middleware, a handler that returns before rendering, a helper) loses the scope on return, even when `enter()` follows its own `await`. Prefer `renderInRequestScope` / `scope.run()`.
- **The transform is build tooling, not runtime.** `src/transform/`, `src/next.ts` and `src/next-loader.ts` never ship in the main bundle (`@babel/core` is external and only they import it) and are excluded from the runtime probes. `t`, `useT`, `<Translate>` and `<Phrase>` are matched by binding, not by name. A `t()` `+` chain joins as JavaScript does (a sum before the first string or in parentheses is one value), and an argument whose own text has no space (a key built in the call) is left alone for legacy-key mode. Names written by the developer (`%name%` anywhere in a unit, params-literal keys, `{name}` in a `t()` text whose params the build cannot read into — a variable, a spread, a computed key — and marker names) are taken. In a `<Translate>`, an attribute the core reads as text (`TRANSLATABLE_ATTRIBUTES` from `/pure`, and `value` on a button or a submit/button input: `VALUE_ELEMENTS`/`VALUE_INPUT_TYPES` restate the core's rule, which no entry exports) is a token, so a value in it is a placeholder: inside the attribute's text its param is the string JavaScript builds (`` `${v}` ``, `'' + v`), and a value that is the whole attribute, or also in the content, is passed as given; on an element whose opt-out or input `type` is an expression the value is left as written and the `<Translate>` gets `data-ls-unnamed`. A `<Phrase>` keys no attributes, so the transform leaves them alone there. A placeholder is written `%name%`, or `{name}` (the stored form) where the text before it ends in a `%` and a name the core has not closed, which `%name%`'s own `%` would close, read as the core registers it (C0 controls dropped) and as it renders it (kept) (`placeholderAfter`). Bindings are compared by their declaring identifier, which survives another plugin's `scope.crawl()` in the same Babel pass. Names are the core's (`derivePlaceholderNames`, VAR-2); `naming.ts` only maps a Babel expression onto the core's `ExpressionShape`, and the vendored `vectors/var-naming-vectors.json` checks both the mapping and the names. Inside a subtree the core shows as written (`<DontTranslate>`, `translate="no"`, `data-notrans`, read as the core's `isTranslationExcluded` reads them, and the core's `NON_TRANSLATABLE_ELEMENTS`) the transform never writes `%name%`: it wraps the value in the VAR-3 marker (`<span data-ls-param>`) and passes no param. In a `<Translate>`, an opt-out attribute whose value is an expression marks the value and passes it as a param too (the param wins over the marked text when the element turns out translated); in a `<Phrase>` the value is a `%name%` placeholder, which the core fills either way (an author's exclusion takes the caller's params); where no marker can stand (inside MathML/SVG an HTML `<span>` draws nothing; `<textarea>`, `<title>`, `<option>` hold text only) a value in an excluded part is left as written and a `<Translate>`, which would store it, gets `data-ls-unnamed` (registers nothing); `<script>` and `<style>` are raw text, left as written, and a `<Translate>` holding a value there gets `data-ls-unnamed`. Expressions holding JSX are never rewritten, nor is `{children}` that is all the text of its run in translated text (content); beside text, or in an excluded subtree, it is a value. Fragments are unwrapped, and every children list the transform changes is settled into one string per run of text as JSX renders the source (`settle`), so the runtime's split-text check (VAR-7) never fires on the transform's own output, in a babel.config.json pass or after Vite/Next recompile it. At runtime `withNodeParams` (`block-nodes.ts`) decides by the value: one the core's params take (text, number, boolean, Date) stays a param; null/undefined fill the placeholder with nothing; a bigint becomes its digits; a promise or context is read with React's `use` (read off the module, never imported by name: React 18, in the peer range, has none and must still load); anything else is put back in the placeholder's place for React to render (in a keyed fragment; a one-shot list read once per object and kept, a `Set` read at each render). Node params are put back at a placeholder in either spelling, found as the core reads placeholders (left to right, so `%a%b%b%` is `%a%`, `b`, `%b%`); a host element's prop that is exactly a node param's placeholder takes the value itself, which React writes as it writes any attribute, and a node param in an attribute's text fills it as `String(value)`. Every other value fills an attribute's placeholder as it fills text. A context left in content is read the same way where children are flattened (`withoutFragments`). A `<Phrase>` holding a hand-written marker in its text (inside a conditional or a component too) gets every value marked (and passed as a param), since the core serves a phrase with markers as its source on a catalog miss; a value in its translated text where no marker can stand is left as written and the phrase gets `data-ls-unnamed`. Names a hand-written marker carries are taken (`markedNames`).
- **Never branch on capability.** `write_enabled` is server-computed because the same key can be write-enabled from one IP and read-only from another. The React layer surfaces it and never infers it. Likewise no caching of lookups, no network scheduling, and no config keys the base SDK doesn't define.

## Testing approach

Vitest in a `node` environment. The current test covers the locale-store adapter contract; the reactive read path is exercised by the `example/` playground. New features benefit from tests, especially around `useSignal`/`useLocaleStore` and the `<Translate>` mount lifecycle (add `jsdom` + `@testing-library/react` when you start testing components).
