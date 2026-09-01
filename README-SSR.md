# SSR Usage Guide (Next.js / Remix)

This guide shows how to use `langsys-js-react` with Server-Side Rendering (SSR) to eliminate duplicate API calls and improve performance.

## The problem

In a traditional SSR flow:
1. The server fetches translations during render.
2. The client re-fetches the same translations after hydration.
3. Duplicate API calls, slower initial render, possible flash of untranslated content.

## The solution

Pass pre-fetched translations from server to client using the `initialTranslations` config option. The client SDK uses them as-is and skips the initial fetch.

> **Read this before the walkthrough — what `initialTranslations` does and does not fix.**
>
> `init()` runs in an effect, so it is client-only, and in the App Router a Client Component and a Server Component hold **separate module instances** of the SDK. Measured against `langsys-js-react@0.6.7` on Next 16, production build:
>
> - **The server-rendered HTML for a Client Component is NOT translated.** It contains base-locale text. A crawler that does not execute JS sees the base language, and this is true at one request with no concurrency — it is not a race.
> - **Translations become correct after hydration**, once `init()` resolves. That took 405–490ms in my probe, because the seed sits behind a network `validate()` call inside `init()`. The number is environment-specific; the ordering is not.
> - **The gap is a flash, and it is not always base copy.** The catalog is persisted to `localStorage` without a locale tag, so a returning visitor sees the *previously viewed language* until `init()` resolves — measured ~180–240ms of French on a German page after navigating FR→DE.
>
> So `initialTranslations` fixes the duplicate fetch and makes the page correct after hydration. It does **not** give you server-rendered translated markup, and therefore does not give you SEO. For crawler-visible translated copy in the App Router, see [Server-rendered copy](#server-rendered-copy-app-router) below.

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

<a id="server-rendered-copy-app-router"></a>

## Server-rendered copy (App Router)

`initialTranslations` cannot put translated text in the served HTML — `init()` is client-only and the Server Component graph holds a different SDK module instance. For copy a crawler must see, translate it in the Server Component itself, with a **pure function** that takes the catalog and locale as arguments and touches no module state:

```tsx
// lib/pureT.ts
import { interpolate } from 'langsys-js-typescript';
import type { iCategories, TranslationParams } from 'langsys-js-react';

export function makeCatalogT(catalog: iCategories, locale: string) {
    return function t(phrase: string, category = '', params?: TranslationParams) {
        const hit = (catalog as any)?.[category || '__uncategorized__']?.[phrase];
        const out = hit ?? phrase;
        return params ? interpolate(out, params, locale) : out;
    };
}
```

```tsx
// app/[locale]/page.tsx  (Server Component)
export default async function Page({ params }) {
    const { locale } = await params;
    const catalog = await getTranslations(locale);
    const t = makeCatalogT(catalog, locale);

    return <h1>{t('Welcome back', 'Home')}</h1>;   // in the served bytes
}
```

Measured on Next 16, production build, `langsys-js-react@0.6.7`: `curl` of a localized route returns genuinely translated body copy, ICU plural rules intact (`interpolate` is the SDK's own pure helper), and 8 locales × 10 rounds fired concurrently gave 80/80 correct with zero cross-request bleed.

It is concurrency-safe **by construction** — the catalog is an argument, so there is no shared state to race and no module graph to be on the wrong side of.

> **Do not instead seed the global stores from a Server Component.** Calling `sTranslations.set()` / `currentlyLoadedLocale.set()` in a Server Component appears to work — the value reads back correctly in that graph — but the Client Components that call `useT()` are in a different graph and never see it. Measured: 100% of non-base locales rendered base content, at one request with no concurrency.
>
> This is worth stating separately because it **fails a concurrency test**. A harness that checks for cross-request contamination reports zero bleed, since every response is uniformly wrong in the same way. To catch it, compare each response against its own expected content, not against the other responses.

Use the pure function for crawler-visible copy and `initialTranslations` for the interactive client tree. They are different jobs, not alternatives.

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

> **Pages Router can remove the flash entirely, and the App Router cannot.** In the Pages Router the seed and the read happen in the same module graph, so seeding **during render** — synchronously in `_app`, from `pageProps` — beats first paint:
>
> ```tsx
> export default function App({ Component, pageProps }: AppProps) {
>     if (pageProps.translations) {
>         sTranslations.set(pageProps.translations);          // during render, not in an effect
>         currentlyLoadedLocale.set(pageProps.locale);
>     }
>     return <Component {...pageProps} />;
> }
> ```
>
> Measured: with a stale French catalog in `localStorage`, loading a German route showed `Hallo` at 42ms and every sample thereafter — no French frame, and no hydration mismatch. The `init()`-in-`useEffect` form above does not achieve this, because the stale paint has already happened by the time the effect runs.
>
> **This placement is safe here and unsafe on the server.** The rule is that the seed and every read must sit in one uninterrupted render pass. On the client there is one request, so it always holds. During SSR it holds only while nothing suspends in between — put an `await` between the seed and a `t()` read and concurrent requests bleed into each other (measured 70/80 wrong under `renderToPipeableStream` with a suspending child; 0/80 with a synchronous tree at the same witnessed concurrency).

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
> Don't swap it for a locale check either: `currentlyLoadedLocale` is written only on the success path, so a switcher gating purely on `useCurrentLocale() === requested` never reveals anything at all when a fetch fails. Await the promise as the "it ended" signal, then compare the locale in a **later render** as the "it worked" signal. Treat only a *match* as positive: the locale write is deferred 100ms behind the promise, so a mismatch right after it settles is the normal success path mid-flight, not a failure. There is no signal that separates a failed fetch from one that just succeeded — use your own timeout if you need an error state. (Verified against `langsys-js-typescript@0.6.5`.)

> Keep one locale store for the app (created where you call `init`) and thread `setLocale` down via context or props, rather than calling `useLocaleStore` with a fresh initial value in unrelated trees.

## Benefits

### Performance
- No duplicate API calls (server + client).
- Faster Time to Interactive (TTI).
- Reduced API usage and costs.

### User experience
- Correct translations from the first render **after hydration**.
- In the Pages Router, seeding during render removes the flash entirely (see below).

> **Not claimed, because it was measured otherwise.** This pattern does not give the App Router "no flash of untranslated content" or "better SEO with server-rendered translations" — a Client Component's server HTML carries base-locale text regardless of `initialTranslations`, and the flash lasts until `init()` resolves. Use the [pure catalog function](#server-rendered-copy-app-router) for copy that must be in the served bytes.

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
