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
        return LangsysApp.translationsLoadingPromise; // optional: settles when the fetch ends (success OR failure)
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

> `translationsLoadingPromise` resolves on a **failed** fetch as well as a successful one, and it resolves ~100ms before `currentlyLoadedLocale` updates — so don't treat it as "the new language is ready". A switcher that awaits it and then reveals content can reveal the *previous* locale's text.
>
> Don't swap it for a locale check either: `currentlyLoadedLocale` is written only on the success path, so a switcher gating purely on `useCurrentLocale() === requested` never reveals anything at all when a fetch fails. Await the promise as the "it ended" signal, then compare the locale in a **later render** as the "it worked" signal — a mismatch once it has settled is your failure case, and the only one you get. (Verified against `langsys-js-typescript@0.6.5`.)

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

## Configuration options

### SSR token strategy

```typescript
{ ssrTokenStrategy: 'client' | 'server' | 'auto' }
```

- `'client'` (default) — queue tokens, send from client after hydration.
- `'server'` — send tokens immediately from server.
- `'auto'` — small batches (≤5) from server, larger batches from client.

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
5. **Token creation.** Use a read-only API key for the client in production — missing tokens won't be sent. Keep the write key on the server (and ideally pre-populate tokens via your local dev environment).
6. **`'use client'`.** `useT`, `useLocaleStore`, `<Translate>`, and `LangsysApp.init` run on the client — keep them in Client Components.

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
