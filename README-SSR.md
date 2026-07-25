# SSR Usage Guide (Next.js / Remix)

This guide shows how to use `langsys-js-react` with Server-Side Rendering (SSR) to eliminate duplicate API calls and improve performance.

## The problem

In a traditional SSR flow:
1. The server fetches translations during render.
2. The client re-fetches the same translations after hydration.
3. Duplicate API calls, slower initial render, possible flash of untranslated content.

## The solution

Pass pre-fetched translations from server to client using the `initialTranslations` config option. The client SDK uses them as-is and skips the initial fetch. Because the hooks are built on `useSyncExternalStore` with a server snapshot, the first paint already reflects the seeded translations.

## Next.js — App Router

### Step 1: Fetch translations on the server

```tsx
// app/layout.tsx (Server Component)
import type { iCategories } from 'langsys-js-react';
import { LangsysClient } from './LangsysClient';

async function getTranslations(locale: string): Promise<iCategories> {
    const res = await fetch(
        `https://api.langsys.dev/api/projects/${process.env.LANGSYS_PROJECT_ID}/translations?locale=${locale}`,
        { headers: { 'x-Authorization': process.env.LANGSYS_API_KEY!, 'Content-Type': 'application/json' } }
    );
    const result = await res.json();
    return result.data as iCategories;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const locale = 'en'; // from cookie / Accept-Language / route segment
    const translations = await getTranslations(locale);

    return (
        <html lang={locale}>
            <body>
                <LangsysClient
                    locale={locale}
                    translations={translations}
                    projectId={process.env.LANGSYS_PROJECT_ID!}
                    apiKey={process.env.NEXT_PUBLIC_LANGSYS_API_KEY!} // read-only key for the client
                >
                    {children}
                </LangsysClient>
            </body>
        </html>
    );
}
```

### Step 2: Initialize on the client

```tsx
// app/LangsysClient.tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { LangsysApp, useLocaleStore, type iCategories } from 'langsys-js-react';

export function LangsysClient({
    locale,
    translations,
    projectId,
    apiKey,
    children,
}: {
    locale: string;
    translations: iCategories;
    projectId: string;
    apiKey: string;
    children: ReactNode;
}) {
    const [, , localeStore] = useLocaleStore(locale);

    useEffect(() => {
        LangsysApp.init({
            projectid: projectId,
            key: apiKey,
            UserLocaleStore: localeStore,
            baseLocale: 'en',
            initialTranslations: translations,
            initialTranslationsLocale: locale,
            ssrTokenStrategy: 'client',
        });
    }, [localeStore, projectId, apiKey, translations, locale]);

    return <>{children}</>;
}
```

### Step 3: Use translations in any client component

```tsx
'use client';
import { useT } from 'langsys-js-react';

export function Hero() {
    const t = useT();
    return (
        <>
            <h1>{t('Welcome', 'HomePage')}</h1>
            <p>{t('Hello, {name}!', 'HomePage', { name: 'Sarah' })}</p>
        </>
    );
}
```

## Next.js — Pages Router

```tsx
// pages/_app.tsx
import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { LangsysApp, useLocaleStore } from 'langsys-js-react';

export default function App({ Component, pageProps }: AppProps) {
    const locale = pageProps.locale ?? 'en';
    const [, , localeStore] = useLocaleStore(locale);

    useEffect(() => {
        LangsysApp.init({
            projectid: process.env.NEXT_PUBLIC_LANGSYS_PROJECT_ID!,
            key: process.env.NEXT_PUBLIC_LANGSYS_API_KEY!,
            UserLocaleStore: localeStore,
            baseLocale: 'en',
            initialTranslations: pageProps.translations,
            initialTranslationsLocale: locale,
        });
    }, [localeStore, pageProps.translations, locale]);

    return <Component {...pageProps} />;
}
```

```tsx
// pages/index.tsx — fetch translations in getServerSideProps
import type { iCategories } from 'langsys-js-react';

export async function getServerSideProps() {
    const locale = 'en';
    const res = await fetch(
        `https://api.langsys.dev/api/projects/${process.env.LANGSYS_PROJECT_ID}/translations?locale=${locale}`,
        { headers: { 'x-Authorization': process.env.LANGSYS_API_KEY!, 'Content-Type': 'application/json' } }
    );
    const { data } = await res.json();
    return { props: { locale, translations: data as iCategories } };
}
```

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

## Benefits

### Performance
- No duplicate API calls (server + client).
- Translations ready immediately on hydration.
- Faster Time to Interactive (TTI).
- Reduced API usage and costs.

### User experience
- No flash of untranslated content.
- Instant translation display.
- Better SEO with server-rendered translations.

### Developer experience
- Simple configuration.
- Full TypeScript support, including compile-time-checked interpolation params on `t()`.

## Discovering server-rendered content

Automatic token discovery happens wherever `t()` runs. In both setups above the SDK is initialized inside a `useEffect`, and effects never run during server rendering — so **there is no configured SDK instance in the Node process at all**. Everything the SDK does happens in the browser.

That is fine for most content, but it has one consequence worth understanding before you rely on discovery:

| What renders the text | Discovered? | Why |
| --- | --- | --- |
| `t()` in a Client Component | Yes | It runs again in the browser during hydration, and the miss is caught there. |
| `<Translate>` / `<Phrase>` | Yes | They tokenize the delivered DOM on mount, whichever side rendered it. |
| `t()` in a Server Component | **No** | It executes only in Node, emits plain text with no marker, and no client-side `t()` ever runs for it. |

A bare `t('Welcome', 'HomePage')` inside a Server Component renders correct-looking base-language text and registers nothing — in every environment, including local development. Because the server has no initialized SDK instance, it also has no catalog, so such a call always renders the base language regardless of the user's locale. `ssrTokenStrategy` does not change any of this (see below).

To make server-rendered content translatable and discoverable, wrap it in `<Translate>` or `<Phrase>`. Both are Client Components, and this package ships no `'use client'` directive, so re-export them through a file of your own that has one:

```tsx
// app/langsys-client.tsx
'use client';
export { Translate, Phrase, DontTranslate } from 'langsys-js-react';
```

```tsx
// app/Hero.tsx — a Server Component
import { Translate } from './langsys-client';

export default function Hero() {
    return (
        <Translate category="HomePage">
            <h1>Welcome</h1>
            <p>Start your free trial today.</p>
        </Translate>
    );
}
```

The children are server-rendered as normal; the client instance walks the delivered DOM on mount, registers the tokens, and re-translates on locale change.

If you'd rather not wrap it, register those phrases another way — through the Translation Manager, or from a client-rendered path that exercises the same strings.

## Configuration options

### SSR token strategy

```typescript
{ ssrTokenStrategy: 'client' | 'server' | 'auto' }
```

This controls when tokens found during a *server* render are registered. It acts on an SDK instance running inside the rendering process, so it only does anything if `LangsysApp.init()` has run in that process.

**In the Next.js setups above it is inert** — `init()` runs in a `useEffect`, so no such instance exists and the option has nothing to act on. Leave it at the default and use the guidance in [Discovering server-rendered content](#discovering-server-rendered-content) instead.

The option is meaningful only in genuinely isomorphic deployments — a custom server, or same-process SSR where `init()` runs in the rendering process:

- `'client'` (default) — nothing is registered from the server render. Content that also renders on the client is caught there, when `t()` runs in the browser. (Base SDK 0.5.0+ skips collecting these entirely; earlier versions queue them in the server process and never drain that queue.)
- `'server'` — tokens are registered directly from the server render. Note that this originates from your server's IP rather than a browser's.
- `'auto'` — small batches (≤5) registered from the server, larger ones deferred to the client.

One constraint on isomorphic use: the catalog and locale stores are module-scope singletons, so a rendering process is effectively single-locale. Concurrent requests for different locales share one catalog and will show each other's language.

### Debug mode

```typescript
{ debug: true, initialTranslations: translations, initialTranslationsLocale: locale }
```

Look for:
- `SSR initial translations config:` on init — confirms pre-fetched data is detected.
- `Using pre-fetched translations for locale` — confirms the initial fetch was skipped.
- `Locale change detected!` — fires on a subsequent locale switch.

## Important notes

1. **One-time use.** `initialTranslations` is consumed only at init. Locale changes after init go through the normal fetch path.
2. **Matching locales.** Always provide `initialTranslationsLocale` with `initialTranslations` so the SDK knows what locale the data represents.
3. **Data format.** The translations payload must match the `iCategories` shape returned by `LangsysAppAPI.getTranslations()`.
4. **Cache.** The 60-second locale cache still applies. Pre-fetched translations count as cached.
5. **Token creation.** Use a read-only API key in the client in production — anything shipped in public JS is extractable, and with a read-only key missing tokens simply aren't sent. Populate the catalog from your development environment instead, where a write key stays on your own machine. Note that a write key handed to the Next server does nothing on its own: there is no SDK instance there to use it.
6. **`'use client'`.** `useT`, `useLocaleStore`, `<Translate>`, `<Phrase>`, and `LangsysApp.init` all run on the client, and this package ships no `'use client'` directive — put them behind a Client Component boundary of your own, as in the `LangsysClient` and `langsys-client.tsx` examples above. This applies to *every* import from `langsys-js-react`, not just the hooks and components: the package builds to a single bundled module that imports React hooks, so pulling any export of it into a Server Component pulls in that module. For the parts you legitimately want on the server — `LangsysAppAPI`, or `detectPreferredLocale()` against an `Accept-Language` header — import them from `langsys-js-typescript` instead. It's this package's own dependency, it's already in your tree, and it has no React in it.

## Troubleshooting

### Translations not appearing
- Check that `initialTranslationsLocale` matches the `UserLocaleStore` value at init.
- Verify the translations payload matches the `iCategories` shape.
- Enable `debug: true` and look for the messages above.

### Still seeing duplicate API calls
- Confirm both `initialTranslations` *and* `initialTranslationsLocale` are passed.
- Confirm init runs before any rendering that calls `t(...)`.
- Confirm the locale hasn't drifted between server and client.

### Hydration mismatch warnings
- Make sure the `locale` you seed on the server matches the initial value you pass to `useLocaleStore` on the client.
- Keep `LangsysApp.init` inside `useEffect` (client-only) so the server render and the first client render agree.

### TypeScript errors on `t()`
- Placeholders are compile-time-checked: `t('Hello, {name}!', 'Cat')` *requires* a params object with `name`. Either add the key or remove the placeholder.
- Allowed param value types: `string | number | Date | boolean`.
