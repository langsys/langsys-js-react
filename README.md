# Langsys SDK - React

Langsys revolutionizes localization for apps with easy to integrate, realtime, continuous translations. Read more about Langsys Translation Manager [at the website](https://Langsys.dev/).

Integrate the Langsys Translation Manager into your React, Next.js, Remix, or Vite applications using this SDK.

## Requirements

- **React 18 or 19** (the reactive layer is built on `useSyncExternalStore`).

[![GitHub Release](https://img.shields.io/github/release/langsys/langsys-js-react.svg?style=flat)]()
[![GitHub last commit](https://img.shields.io/github/last-commit/langsys/langsys-js-react.svg?style=flat)]()
[![GitHub pull requests](https://img.shields.io/github/issues-pr/langsys/langsys-js-react.svg?style=flat)]()
[![PR's Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](http://makeapullrequest.com)
[![NPM License](https://img.shields.io/npm/l/all-contributors.svg?style=flat)](https://github.com/langsys/langsys-js-react/blob/main/LICENSE)

## How it's layered

`langsys-js-react` is a thin React binding over the framework-agnostic [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript) package — which owns the API client, translation lifecycle, token discovery, DOM tokenizer, and SSR-aware token strategies. This package adds only the React-native concerns:

- A `LangsysApp` whose `init` accepts a `Signal<string>` (made with `createLocaleStore`) for the user locale
- Hooks — `useT`, `useCurrentLocale`, `useTranslations`, `useLocaleStore` — that re-render components when translations or the loaded locale change
- A `<Translate>` component wrapping the underlying DOM walker

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
    const [, , localeStore] = useLocaleStore('en-us');
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        LangsysApp.init({
            projectid: import.meta.env.VITE_LANGSYS_PROJECT_ID,
            key: import.meta.env.VITE_LANGSYS_API_KEY,
            UserLocaleStore: localeStore,
            baseLocale: 'en-us',
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

`UserLocaleStore` is a `Signal<string>` — switch it with `setLocale(...)` (from the same `useLocaleStore` call) or `localeStore.set('fr-fr')`, and the SDK reacts. If you'd rather keep the locale store at module scope, `const localeStore = createLocaleStore('en-us')` works too.

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

Allowed value types: `string | number | Date | boolean`. Dates serialize to ISO 8601.

> Future versions will swap the simple `{name}` runtime for ICU MessageFormat — adding plural / select / date formatting — without changing the public signature. Today's `t('{count} items', 'Cart', { count })` will evolve to `t('{count, plural, one {# item} other {# items}}', 'Cart', { count })`.

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
- Recursively tokenizes text nodes and translatable attributes (`placeholder`, `alt`, `title`, `aria-label`, plus button/input `value` attributes and `<option>` text).
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

`<Translate>` props: `category?`, `custom_id?`, `label?`, `tag?` (defaults to `translate`), `className?`, `children`.

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
const localeName                = await LangsysApp.getLocaleNameWithLookup('es-es', true, 'fr-fr'); // "espagnol"
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

The matcher tries exact match first (e.g. `en-US`), then language-only (`en` matches `en-GB`), then returns `false` if no match.

### Waiting for translations to load

When changing locale mid-session, you may want to re-run dependent code after the new translations arrive:

```tsx
useEffect(() => {
    LangsysApp.translationsLoadingPromise.then(() => {
        // re-render content / regenerate UI here
    });
}, [locale]);
```

## License

MIT © Langsys
