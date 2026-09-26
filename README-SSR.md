# SSR Usage Guide

This guide covers rendering `langsys-js-react` on a server: serving each request its own locale's translations, handing the client the catalog the server rendered with, and collecting what the server render missed.

## How it works

A server process renders for many visitors at once. The SDK keeps its catalog and locale in module state, which is right for a browser page and wrong for a server, so each request renders inside a **request scope** of its own — the core's, from `langsys-js-typescript`. A scope has its own locale, its own view of the catalog, its own misses and its own hydration seed, and nothing one request's scope does reaches another's.

This package's server entry, `langsys-js-react/server`, opens a scope around one request's render. It is Node-only (it hands the core an `AsyncLocalStorage`, so the scope stays current across every `await` in the render) and is never part of the main bundle.

## Rendering one request

```tsx
// server.tsx
import { renderToString } from 'react-dom/server';
import { renderInRequestScope } from 'langsys-js-react/server';

app.get('*', async (req, res) => {
    const locale = resolveLocale(req); // your framework's or app's resolved locale

    const { result: html, seed, close } = await renderInRequestScope(
        { locale, url: req.url },
        () => renderToString(<App />),
    );

    res.send(`<!doctype html>
<div id="root">${html}</div>
<script>window.__LANGSYS_SEED__ = ${JSON.stringify(seed)}</script>
<script type="module" src="/client.js"></script>`);

    await close(); // after the response: hands this request's misses to the core
});
```

- `renderInRequestScope({ locale, catalog?, url? }, render)` opens a scope, runs `render` inside it and resolves once it has finished. The scope fetches the locale's catalog at most once per request, shared read-only with other requests rendering the same locale; pass `catalog` when you already have it (from a snapshot or your own fetch).
- Inside the render, `useT()` and `LangsysApp.t` read this request's catalog.
- `seed` is `{ locale, catalog }`: exactly what this request rendered with.
- `close()` runs after the response has been sent. What it does with the misses is set by `ssrTokenStrategy` (below). It never throws, and calling it again returns the first result.

Where your framework cannot wrap its render in a function, open the scope and enter it instead, in the request's own async function, before anything renders:

```ts
import { createRequestScope, installRequestScopeStorage } from 'langsys-js-react/server';

installRequestScopeStorage(); // once, at startup

// in the request handler, before rendering:
const scope = await createRequestScope({ locale, url });
scope.enter(); // current for the rest of this request's async context
// ...render, send scope.seed() with the page, then after the response:
await scope.close();
```

`scope.enter()` must be called in the function that goes on to render, not inside a helper it awaits: it makes the scope current for the async context it is called in.

## Hydrating on the client

Seed the client with the server's catalog **before** hydrating, so the first client render matches the server's HTML:

```tsx
// client.tsx
import { hydrateRoot } from 'react-dom/client';
import { LangsysApp, createLocaleStore } from 'langsys-js-react';

const seed = window.__LANGSYS_SEED__;
LangsysApp.seedCatalog(seed.catalog, seed.locale); // synchronous

const localeStore = createLocaleStore(seed.locale);
hydrateRoot(document.getElementById('root')!, <App localeStore={localeStore} />);

LangsysApp.init({
    projectid: PROJECT_ID,
    key: PUBLIC_KEY, // a read-only key in the browser
    UserLocaleStore: localeStore,
    baseLocale: 'en',
});
```

`seedCatalog` is synchronous and marks the locale as loaded, so `init()` does not fetch it again.

## Next.js

Next renders the tree itself, in phases this package does not wrap, so it does not yet ship wiring for the App Router or the Pages Router. The calls are the ones above: open a scope in the async context that renders the request, hand `scope.seed()` to the page, and close it after the response (`after()` from `next/server`). Until this package ships and tests that wiring, a Next app initializes the SDK on the client only, with `LangsysApp.init()` in a Client Component's `useEffect`; server-rendered text is then source text until the client translates it.

## What a server render translates and discovers

| What renders the text | Translated on the server | Discovered |
| --- | --- | --- |
| `t()` / `useT()` inside a scope | Yes, in the request's locale | Yes: the miss is recorded in the scope and handed on by `close()` |
| `<Translate custom_id="…">` | No — source text until the client translates it | On the client, when it mounts; the server HTML already carries its `data-ls-contentblock` identity |
| `<Translate>` without `custom_id`, `<Phrase>` | No — source text until the client translates it | On the client, when it mounts |

`<Translate>` and `<Phrase>` hand their DOM to the core on mount, and a server renders no DOM, so block content reaches the browser in the source language and is translated there. `useCurrentLocale()` and `useTranslations()` read the process-wide locale and catalog even inside a scope, so on a server read the request's locale from `scope.locale` rather than from them.

## Locale switching

Update the store from the same `useLocaleStore` call; the SDK reacts and fetches the new locale's translations:

```tsx
'use client';
import { LangsysApp, useLocaleStore } from 'langsys-js-react';

export function LocaleSwitcher() {
    const [locale, setLocale] = useLocaleStore('en');

    function changeLocale(next: string) {
        setLocale(next); // subscribers in the SDK trigger a fetch
        return LangsysApp.translationsLoadingPromise; // optional: await the in-flight fetch
    }

    return (
        <select value={locale} onChange={(e) => changeLocale(e.target.value)}>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
        </select>
    );
}
```

> Keep one locale store for the app (created where you call `init`) and thread `setLocale` down via context or props, rather than calling `useLocaleStore` with a fresh initial value in unrelated trees.

## Configuration options

### SSR token strategy

```typescript
{ ssrTokenStrategy: 'client' | 'server' | 'auto' }
```

This decides what `close()` does with the phrases a scoped server render missed. It acts on an SDK initialized in the rendering process (`LangsysApp.init()` on the server):

- `'client'` (default) — nothing is sent from the server. Content that also renders on the client is caught there, when `t()` runs in the browser.
- `'server'` — `close()` sends the misses from the server, when the server's key may write. Note that this originates from your server's IP rather than a browser's.
- `'auto'` — `close()` sends a short list (fewer than 5) from the server and leaves a longer one to the client.

`close()` never throws; its result says whether it sent or why it skipped.

### Debug mode

Pass `debug: true` to `init()` to log the SDK's lifecycle to the console, including `Locale change detected!` on a locale switch.

## Important notes

1. **Seed before hydrating.** Call `LangsysApp.seedCatalog(seed.catalog, seed.locale)` before `hydrateRoot`, with the seed from the same request. Seeding after hydration, or from another request, renders different text from the server's HTML.
2. **One scope per request.** Open a scope for every request and close it after that request's response. Never share one across requests: sharing one is exactly the cross-visitor leak the scope exists to prevent.
3. **Data format.** A `catalog` passed to a scope must match the `iCategories` shape returned by `LangsysAppAPI.getTranslations()`.
4. **Keys.** Use a read-only API key in the browser — anything shipped in public JS is extractable. A write key belongs on the server, where `close()` can send a scope's misses with it under the `'server'` or `'auto'` strategy.
5. **Server-only entry.** Import `langsys-js-react/server` only from server code; it imports `node:async_hooks`. The main entry imports React hooks, so in a React Server Component environment put its hooks and components behind a Client Component boundary of your own (this package ships no `'use client'` directive).

## Troubleshooting

### Another visitor's language appears in a page
- Every render must run inside its own request's scope: `renderInRequestScope`, or `scope.enter()` called in the request's own async function before rendering.
- `useCurrentLocale()` and `useTranslations()` read process-wide state even inside a scope; use `scope.locale` on the server.

### Hydration mismatch warnings
- Seed the client with the seed of the request that rendered the page, before `hydrateRoot`.
- Make sure the locale store's initial value on the client is the seed's locale.

### TypeScript errors on `t()`
- Placeholders are compile-time-checked: `t('Hello, {name}!', 'Cat')` *requires* a params object with `name`. Either add the key or remove the placeholder.
- Allowed param value types: `string | number | Date | boolean`.
