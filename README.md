# Langsys SDK - React

[![npm](https://img.shields.io/npm/v/langsys-js-react.svg?style=flat)](https://www.npmjs.com/package/langsys-js-react)
[![build](https://img.shields.io/github/actions/workflow/status/langsys/langsys-js-react/ci.yml?style=flat)](https://github.com/langsys/langsys-js-react/actions)
[![last commit](https://img.shields.io/github/last-commit/langsys/langsys-js-react.svg?style=flat)](https://github.com/langsys/langsys-js-react/commits)
[![commit activity](https://img.shields.io/github/commit-activity/m/langsys/langsys-js-react.svg?style=flat)](https://github.com/langsys/langsys-js-react/pulse)
[![bundle size](https://img.shields.io/bundlejs/size/langsys-js-react?style=flat)](https://bundlejs.com/?q=langsys-js-react)
[![types](https://img.shields.io/npm/types/langsys-js-react.svg?style=flat)](https://www.npmjs.com/package/langsys-js-react)
[![downloads](https://img.shields.io/npm/dm/langsys-js-react.svg?style=flat)](https://www.npmjs.com/package/langsys-js-react)
[![license](https://img.shields.io/npm/l/langsys-js-react.svg?style=flat)](./LICENSE)

Langsys revolutionizes localization for apps with easy to integrate, realtime, continuous translations. Read more about Langsys Translation Manager [at the website](https://Langsys.dev/).

Integrate the Langsys Translation Manager into your React, Next.js, Remix, or Vite applications using this SDK.

## Requirements

- **React 18 or 19** (the reactive layer is built on `useSyncExternalStore`).

## How it's layered

`langsys-js-react` is a thin React binding over the framework-agnostic [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript) package — which owns the API client, translation lifecycle, token discovery, DOM tokenizer, and SSR-aware token strategies. This package adds only the React-native concerns:

- A `LangsysApp` whose `init` accepts a `Signal<string>` (made with `createLocaleStore`) for the user locale
- Hooks — `useT`, `useCurrentLocale`, `useTranslations`, `useLocaleStore` — that re-render components when translations or the loaded locale change
- Components — `<Translate>` (HTML content blocks), `<Phrase>` (markup-bearing phrases for pluralization), `<DontTranslate>` (never-translated regions)

If you need the SDK outside React (a Node script, a non-React web app), import from `langsys-js-typescript` directly.

## Install

```bash
npm install langsys-js-react
```

`langsys-js-typescript` is installed automatically as a transitive dependency. `react` is a peer dependency you already have.

## Creating a Langsys project

Visit [Langsys.dev](https://Langsys.dev/) to create your account, then create your project. Take note of your project ID and API key.

### API key permissions

- **Write key** (development): the SDK auto-creates new translation tokens and content blocks as they appear in your app.
- **Read-only key** (production): the SDK fetches translations only — no token creation, no content-block writes.

The SDK detects the key type automatically and behaves accordingly.

## Initialization

Initialize once, high in your tree. Create the user-locale store with `useLocaleStore` and pass it to `LangsysApp.init`:

```tsx
// src/LangsysProvider.tsx
import { useEffect, useState, type ReactNode } from 'react';
import { LangsysApp, useLocaleStore } from 'langsys-js-react';

export function LangsysGate({ children }: { children: ReactNode }) {
    const [, , localeStore] = useLocaleStore('en-US');
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        LangsysApp.init({
            projectid: import.meta.env.VITE_LANGSYS_PROJECT_ID,
            key: import.meta.env.VITE_LANGSYS_API_KEY,
            UserLocaleStore: localeStore,
            baseLocale: 'en-US',
            debug: false,
            ssrTokenStrategy: 'client',
        }).then((res) => {
            if (res.status) setReady(true);
            else setError(res.errors?.join(', ') ?? 'Init failed');
        });
    }, [localeStore]);

    if (error) return <p>Langsys init failed: {error}</p>;
    if (!ready) return <p>Loading…</p>;
    return <>{children}</>;
}
```

`UserLocaleStore` is a `Signal<string>` — switch it with `setLocale(...)` (from the same `useLocaleStore` call) or `localeStore.set('fr-FR')`, and the SDK reacts. If you'd rather keep the locale store at module scope, `const localeStore = createLocaleStore('en-US')` works too.

Locale identifiers are canonicalized to BCP 47 by the base SDK (v0.3.0+): lowercase input like `'en-us'` still works, but `useCurrentLocale()` and `detectPreferredLocale()` always return the canonical form (`'en-US'`) — compare against that, or normalize your own values with the re-exported `canonicalizeLocale()`.

### SSR token strategy

`ssrTokenStrategy` (default `'client'`) controls when missing tokens are sent during server rendering:

- `'client'` — tokens collected on the server are flushed from the client after hydration. Best for performance.
- `'server'` — tokens are sent immediately during SSR. Best for reliability and immediate registration.
- `'auto'` — small batches (≤5) sent from server, larger queued for client.

## Using translations

### `useT()` — the everyday API

`useT()` returns the current translation function and re-renders the component whenever translations or the loaded locale change.

```tsx
import { useT } from 'langsys-js-react';

function Welcome() {
    const t = useT();
    return (
        <>
            <h1>{t('Welcome to my app', 'UI')}</h1>
            <p>{t('Hello, {name}!', 'UI', { name: 'Sarah' })}</p>
        </>
    );
}
```

The translation function signature is **`t(phrase, category?, params?)`**:

```tsx
t('Save');                                  // no category, no params
t('Save', 'UI');                            // categorized
t('Hello, {name}!', { name: 'X' });         // no category, with params
t('Hello, {name}!', 'Greetings', { name: 'X' }); // category + params
```

The **phrase itself is the lookup key** *and* the base-language default — there's no separate keys file to maintain. The first render of a phrase registers it in the Translation Manager (when using a write key); from then on, translations are fetched and rendered automatically as locales change.

#### Interpolation

Curly-brace placeholders are substituted from the params argument:

```tsx
t('You have {count} new messages', 'Notifications', { count: 3 });
```

Placeholder names are extracted from the phrase at compile time and **type-checked**: omitting a required key or adding an extra one is a TypeScript error.

```tsx
t('You have {count} new messages', 'Notifications', {});
// ❌ Property 'count' is missing in type '{}'

t('You have {count} new messages', 'Notifications', { count: 3, extra: 'x' });
// ❌ Object literal may only specify known properties, and 'extra' does not exist
```

Allowed value types: `string | number | Date | boolean`. Since base SDK 0.3.0, values are locale-formatted: numbers go through `Intl.NumberFormat` (`1234.5` → `1.234,5` in `de-DE`) and `Date` values through `Intl.DateTimeFormat` with the medium date style (previously ISO 8601). Pass a string to opt out of formatting. Formatting always uses the catalog locale (falling back to `en`), never the host's default locale, so server and client render identically.

> Future versions will swap the simple `{name}` runtime for full ICU MessageFormat — adding plural / select — without changing the public signature. Style-less ICU arguments (`{n, number}`, `{d, date}`, `{t, time}`) already format as of base SDK 0.3.0. Today's `t('{count} items', 'Cart', { count })` will evolve to `t('{count, plural, one {# item} other {# items}}', 'Cart', { count })`.

#### Categorization disambiguates context

Different categories give the *same* phrase different translations:

```tsx
<strong>{t('Home', 'Main Menu')}</strong>     {/* "Inicio" in Spanish */}
<strong>{t('Home', 'Home repairs')}</strong>  {/* "Hogar" in Spanish */}
```

Without categorization, "Home" would only have one translation — which can't work for both contexts. Langsys's philosophy is *translate once, use everywhere*; categorize when the same phrase legitimately means different things.

A good rule for category names: the module or feature the phrase lives in (`Account`, `Errors`, `Checkout`, `UI`).

### `<Translate>` — HTML content blocks

For larger blocks of HTML where the structure should be preserved for the translator:

```tsx
import { Translate } from 'langsys-js-react';

function Article() {
    return (
        <Translate category="Blog" tag="article">
            <h1 className="title">My article title</h1>
            <p>My content <strong>is the best</strong> when internationalized by Langsys.</p>
            <p>Translators see this exactly as users do — same styling, same structure.</p>
        </Translate>
    );
}
```

The component:
- Recursively tokenizes text nodes, `<option>` text, and translatable attributes — 15 of them, not just the visible ones:
    - **Visible text:** `placeholder`, `alt`, `title`, `label`
    - **Screen-reader text:** `aria-label`, `aria-placeholder`, `aria-description`, `aria-valuetext`, `aria-roledescription` — worth knowing these are covered, since untranslated ARIA strings are invisible on the page and only surface to someone using a screen reader
    - **Validation messages:** `data-error`, `data-error-message`, `data-validation-message`, `data-invalid-message`, `data-required-message`, `data-pattern-message`
- Translates the `value` attribute **only where it is a label rather than data**: on `<button>`, and on `<input type="submit">` / `<input type="button">`. Every other input type is left alone, so a text field's value is never rewritten. This is a separate mechanism from the attribute list above — `value` is deliberately *not* in the SDK's `TRANSLATABLE_ATTRIBUTES`; it's gated by `VALUE_TRANSLATABLE_ELEMENTS` / `VALUE_TRANSLATABLE_INPUT_TYPES`.
- Captures semantic CSS so translators see the styled appearance in the Translation Manager.
- Registers the whole thing as a **content block** that translators handle as one unit while still translating the individual phrases inside.
- Auto re-translates on locale change.

`<Translate>` mounts the SDK's DOM walker on its host element and lets it mutate the rendered output in place, so **keep its children static** — prose, marketing copy, CMS-rendered articles, forms with placeholders. For dynamic per-string values that React owns, use `useT()`.

```tsx
{/* CMS content goes through Translate as-is */}
<Translate category="News" tag="div">
    <div dangerouslySetInnerHTML={{ __html: article?.content ?? '' }} />
</Translate>
```

`<Translate>` also accepts `params` for placeholder interpolation. Write placeholders as **`%key%`** directly in the markup — applied to the resolved text of content-block nodes, translatable attributes, `<option>` text, and single-token content (untranslated fallbacks included). Number/Date values get CLDR locale formatting. Change `params` after mount and the block re-renders:

```tsx
<Translate category="Cart" params={{ count: itemCount }}>
    You have %count% items in your cart.
</Translate>
```

> **Use `%key%` in `<Translate>`/`<Phrase>` markup, not bare `{key}`.** In JSX a literal `{count}` is a JavaScript expression that React evaluates *before* the SDK's DOM walker sees the text — the braces vanish and interpolation silently breaks (it still looks fine in the base locale, which hides it). Worse than breaking: the evaluated value is captured *as part of the phrase*, so every distinct value hashes to its own content block. `%count%` passes through JSX as plain text; the SDK normalizes it to canonical `{count}` at capture, so **translators and the catalog only ever see `{count}`**, and both spellings hash to the same content-block id. Keys are identifier-shaped (`%[A-Za-z_][A-Za-z0-9_]*%`), so a stray `%` in prose ("50% off") is left untouched. An unknown `%key%` with no matching param renders as `{key}` — matching `t()`'s behavior for unknown keys. (`t()` and the hooks keep `{key}`: JS strings reach the SDK literally, so there's no collision.)

> Since base SDK 0.4.2, running with `debug: true` catches this mistake for you: if you pass `params` whose keys match no placeholder in the captured content, the SDK warns and names the fix (`… received params with no matching placeholder … write %count% instead`). It's silent in production, treats ICU slots as legitimate, and only re-warns when the set of param keys changes.

Why that second consequence is the expensive one — measured against the shipped tokenizer (`tokenizeElement` + `generateCustomId`):

```
{count} evaluated by JSX              %count% placeholder
  "You have 0 items"  31ff32bd…         "You have {count} items"  88642c82…
  "You have 1 items"  5aa5eef5…         "You have {count} items"  88642c82…
  "You have 2 items"  89f09f5e…         "You have {count} items"  88642c82…
```

The `%key%` spelling normalizes to canonical `{count}` at capture, so all values share one stable id. The JSX spelling registers a **new content block per distinct value** — wrap a live counter in `<Translate>` and you mint a catalog entry per tick. Nothing looks wrong while it happens: the base locale renders correctly throughout, and the damage shows up later as a Translation Manager full of near-duplicate junk.

`<Translate>` props: `category?`, `custom_id?`, `label?`, `params?`, `tag?` (defaults to `translate`), `className?`, `children`.

### `<Phrase>` — markup-bearing phrases (pluralization)

Keeps a run that contains inline markup as **one** translatable phrase — so a count variable stays next to the noun it pluralizes, and the translator sees the whole sentence:

```tsx
import { Phrase } from 'langsys-js-react';

<Phrase category="ProductCard" params={{ n: reviewCount }}>
    Based on %n% <strong>reviews</strong>
</Phrase>
```

The inline elements never reach the translator — they're replaced with neutral markup tokens (`{m0o}`…`{m0c}`) and the real framework-owned elements are reconstituted around the translated text at render. This is also what lets reordering languages move emphasis correctly (`<span>White</span> House` → `Casa <span>Blanca</span>`). Pass interpolation values via `params`; keep the markup children static.

> Note: write placeholders as `%n%` in `<Phrase>` markup (see the `<Translate>` note above) — a bare `{n}` in JSX is an expression and never reaches the SDK.

`<Phrase>` props: `category?`, `params?`, `tag?` (defaults to `span`), `className?`, `children`.

### `<DontTranslate>` — never-translated regions

Marks content that must be preserved verbatim (brand names, domains, code):

```tsx
import { DontTranslate } from 'langsys-js-react';

Built with <DontTranslate>Kangen®</DontTranslate> on <DontTranslate>langsys.dev</DontTranslate>
```

Renders the host with `translate="no"`, which the base SDK's tokenizer and renderer already honor — the content is never tokenized, registered, or replaced.

`<DontTranslate>` props: `tag?` (defaults to `span`), `className?`, `children`.

## Hooks & reactive primitives

| Export | Type | Notes |
|---|---|---|
| `useT()` | `() => TFunction` | Re-renders on translations/locale change. Call as `const t = useT(); t('Phrase', 'Cat', params?)`. |
| `useCurrentLocale()` | `() => string` | The locale whose translations are currently loaded (lags the user-selected locale until the fetch completes). |
| `useTranslations()` | `() => iCategories` | Raw translation catalog. Rarely needed in app code. |
| `useLocaleStore(initial?)` | `() => [locale, setLocale, store]` | Creates a stable user-locale `Signal<string>`, reads it reactively, returns a setter. Pass `store` to `init`. |
| `useSignal(signal)` | `<T>(s: Signal<T>) => T` | Low-level: subscribe a component to any base-SDK signal. |
| `createLocaleStore(initial?)` | `(s?: string) => Signal<string>` | Make a user-locale store outside React (module scope). |
| `t` / `currentlyLoadedLocale` / `sTranslations` | `Signal<…>` | Raw signals for direct subscription outside React. In components, prefer the hooks. |
| `canonicalizeLocale(locale)` | `(s: string) => string` | Normalize a locale identifier to canonical BCP 47 (`'en-us'` → `'en-US'`) — the same normalization the SDK applies internally. |

## Server-Side Rendering (Next.js, Remix)

The SDK is SSR-compatible. The main pattern is to pre-fetch translations server-side and seed them through `initialTranslations` / `initialTranslationsLocale` so the client doesn't refetch on hydration. `useT` and friends are built on `useSyncExternalStore` with a server snapshot, so they hydrate without a flash of untranslated content when seeded.

📖 **See [README-SSR.md](./README-SSR.md)** for a complete Next.js (App Router & Pages Router) walkthrough.

## Utilities

`LangsysApp` exposes localized helpers (call them from effects / event handlers):

```tsx
import { LangsysApp, type iCountryList, type iCurrencyList, type iLocaleDefault } from 'langsys-js-react';

const countries: iCountryList   = await LangsysApp.getCountries();     // [{ code: "US", label: "United States" }, ...]
const dialCodes                 = await LangsysApp.getDialCodes();     // [{ country_code: "US", dial_code: "+1", name: "United States" }, ...]
const currencies: iCurrencyList = await LangsysApp.getCurrencies();    // [{ code: "USD", name: "US Dollar", symbol: "$", ... }, ...]
const locales: iLocaleDefault   = await LangsysApp.getLocales();       // { "English": [{ code: "en-US", name: "English (US)" }, ...], ... }
const localeName                = await LangsysApp.getLocaleNameWithLookup('es-ES', true, 'fr-FR'); // "espagnol"
```

### Detecting the user's preferred locale

```typescript
// Browser: navigator.languages → fallback to navigator.language
const locale = LangsysApp.detectPreferredLocale();
// Returns 'en-US', 'fr', etc., or false if not detected

// SSR (route handler / middleware): parses Accept-Language
const locale = LangsysApp.detectPreferredLocale(request.headers.get('Accept-Language'));

// Matched against your app's supported locales
const supportedLocales = (await LangsysApp.getLocalesFlat()).map((l) => l.code);
const locale = LangsysApp.detectPreferredLocale(request.headers.get('Accept-Language'), supportedLocales);
```

The matcher tries exact match first (e.g. `en-US`), then language-only (`en` matches `en-GB`), and is script-aware via CLDR likely-subtags (base SDK 0.3.0+): `zh-TW` matches `zh-Hant` and never falls back to `zh-Hans`. Results are always canonical BCP 47; it returns `false` if no match.

### Waiting for translations to load

When changing locale mid-session, you may want to re-run dependent code once the fetch settles:

```tsx
useEffect(() => {
    LangsysApp.translationsLoadingPromise.then(() => {
        // re-render content / regenerate UI here
    });
}, [locale]);
```

> **This promise resolves on failure too — it means "the fetch settled", not "the translations arrived".** In the base SDK the error branch calls the same internal resolver and returns *before* writing the catalog, so a failed fetch resolves exactly like a successful one while `sTranslations` still holds the previous locale's data. Your callback then runs against a stale catalog, and the page renders fluent content in the wrong language with nothing reporting a problem. If that distinction matters, check `useCurrentLocale()` against the locale you asked for rather than trusting the promise.
>
> Two related timing notes: the promise also resolves *before* `currentlyLoadedLocale` is updated (the SDK defers that write by a tick), so reading `useCurrentLocale()` immediately in `.then()` can still return the previous locale — read it from a subsequent render instead. And a locale whose fetch never succeeded leaves the persisted catalog from the last successful locale in place indefinitely, since translations are persisted to `localStorage` without a locale tag.

Verified against `langsys-js-typescript@0.6.5`.

## License

MIT © Langsys
