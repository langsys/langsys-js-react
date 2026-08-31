# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`langsys-js-react` is a React binding over the framework-agnostic [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript) package. The base SDK owns the API client, translation lifecycle, token discovery, DOM tokenizer, and SSR-aware token strategies. This package is intentionally thin and contains only React-native concerns.

It is the React sibling of [`langsys-js-svelte`](https://github.com/langsys/langsys-js-svelte) and exposes the same capabilities, adapted to React idioms: where Svelte uses `$store` auto-subscription, React uses hooks built on `useSyncExternalStore`.

## Layout

```
src/
    index.ts                  # public exports — LangsysApp wrapper, hooks, Translate, raw signals, type re-exports
    adapters.ts               # useSignal (Signal → useSyncExternalStore) + createLocaleStore (the writable analog)
    hooks.ts                  # useT / useCurrentLocale / useTranslations / useLocaleStore
    components/
        Translate.tsx         # React thin wrapper around langsys-js-typescript's vanilla DOM Translate class
    index.test.ts             # smoke coverage for the locale-store adapter
example/                      # Vite playground (npm run dev) — not published
```

That's the entire surface. Every other concern — HTTP, missing-token registration, persistence, SSR strategies, lookup/interpolation logic — lives in `langsys-js-typescript`.

## How the wrapping works

The Svelte wrapper adapts a native store *into* the SDK (`writable` → `Signal`). The React wrapper does the mirror image: it adapts the SDK's signals *out* to React's render cycle, and supplies a `Signal`-shaped locale store on the input side.

1. **`LangsysApp.init({ UserLocaleStore })`** — the wrapper class (`LangsysAppReact` in `index.ts`) accepts a `Signal<string>` for the user locale. Because React's locale store (`createLocaleStore`, an alias of the base SDK's `createSignal`) is *already* a `Signal`, `init` is a straight passthrough — no adapter needed. Every other `LangsysApp.*` method is a direct delegation.

2. **Hooks (`useT`, `useCurrentLocale`, `useTranslations`)** — each wraps a base-SDK signal with `useSignal`, which is `useSyncExternalStore(signal.subscribe, signal.get, signal.get)`. The base SDK's `tSignal` re-emits a fresh `TFunction` closure on every translations/locale change (and a stable reference between changes), which is exactly the identity contract `useSyncExternalStore` needs — no tearing, no render loops. `useT()` returns the current `TFunction`; calling `t('Phrase', 'Cat', params?)` reads the current translation and the component re-renders when the signal changes.

3. **`useLocaleStore(initial)`** — lazily creates one stable `Signal<string>` (via `useState(() => createLocaleStore(...))`), subscribes to it with `useSignal`, and returns `[locale, setLocale, store]`. Pass `store` to `init`; drive the locale with `setLocale`.

4. **`<Translate>`** — wraps the vanilla `Translate` DOM class. A `useRef` gets the host node; a `useEffect` constructs `new Translate(host, opts)` on mount and calls `instance.destroy()` on cleanup. The DOM walking, content-block registration, attribute harvesting, and re-translation on locale change all live in the underlying class. Like the Svelte component, it mutates the rendered DOM in place — keep children static.

## Public API

```typescript
// Main entry point — wraps init to accept a Signal<string>, delegates everything else
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
useSignal(signal)       -> T               // low-level Signal → value bridge

// Store factory + raw signals (advanced / direct subscription)
createLocaleStore(initial?)  // Signal<string> — the writable analog
t, currentlyLoadedLocale, sTranslations  // raw Signals; prefer the hooks in components
createSignal                 // re-exported generic Signal factory
canonicalizeLocale(locale)   // re-exported BCP 47 normalizer — LOWERCASES ('en-US' → 'en-us'), per WIRE-3; the SDK canonicalizes all locale input since base 0.3.0

// Write gating (ticket 838; requires the unreleased base SDK build that carries it)
// NOTE: the raw `writeEnabled` signal is deliberately NOT re-exported — see the
// reasoning at the export site in src/index.ts, pinned by write-enabled-surface.test.ts.
// Access it through useWriteEnabled(); advanced consumers can import the raw signal
// from langsys-js-typescript directly.
setWriteGrant(grant)         // Promise<void> — re-authorizes with an X-Write-Grant header; also LangsysApp.setWriteGrant
writeGrant                   // init option, inherited from the base config type: string | (() => string | null | undefined | Promise<…>)

// Component
<Translate category? custom_id? label? tag? className? children />

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
- **Keep `<Translate>` to mount/destroy glue.** The DOM walking lives in the vanilla `Translate` class in `langsys-js-typescript`. Don't fork the tokenizer here.
- **Type re-exports go through `index.ts`.** Consumers shouldn't have to reach into `langsys-js-typescript` for routine types.
- **The hooks' reactivity story** depends on the base SDK re-emitting a fresh `TFunction` closure on every translations/locale change *and* returning a stable reference between changes. If components don't re-render after a locale change, look at the `tSignal` subscriber wiring in `langsys-js-typescript`'s `Translations` class. If you get an infinite render loop, suspect a signal whose `get()` returns a new reference on every call.
- **Keep the locale store stable.** Never call `createLocaleStore()` inside render without memoizing — use `useLocaleStore` or `useState(() => createLocaleStore(...))`.
- **Don't route `writeEnabled` through `useSignal`.** `useWriteEnabled` deliberately calls `useSyncExternalStore` itself with `getServerSnapshot` pinned to a module-level `() => undefined`. React uses that snapshot for the hydration render as well as the server render, and `writeEnabled` is browser-authoritative — so passing the live getter makes a session whose authorization resolved before hydration render markup that disagrees with the server HTML, and React throws the subtree away. This is the one place a binding-authored decision is correct rather than a smell: the *value* still comes from the core, only *when React may read it* is React-specific. Verify any change here by mutation (unpin the snapshot and confirm tests go red), not by a passing test — the tests pass against a broken implementation unless authorization resolves before hydration.
- **Never branch on capability.** `write_enabled` is server-computed because the same key can be write-enabled from one IP and read-only from another. The React layer surfaces it and never infers it. Likewise no caching of lookups, no network scheduling, and no config keys the base SDK doesn't define.

## Testing approach

Vitest in a `node` environment. The current test covers the locale-store adapter contract; the reactive read path is exercised by the `example/` playground. New features benefit from tests, especially around `useSignal`/`useLocaleStore` and the `<Translate>` mount lifecycle (add `jsdom` + `@testing-library/react` when you start testing components).
