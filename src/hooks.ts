import { useState, useSyncExternalStore } from 'react';
import { currentlyLoadedLocale, sTranslations, tSignal, writeEnabled } from 'langsys-js-typescript';
import type { Signal, TFunction, iCategories } from 'langsys-js-typescript';
import { createLocaleStore, useSignal } from './adapters.js';

/**
 * The current translation function, re-rendering the calling component whenever
 * translations or the loaded locale change. This is the React analog of Svelte's
 * `$t` store read.
 *
 *   const t = useT();
 *   return <h1>{t('Welcome to my app', 'UI')}</h1>;
 *
 * The phrase is both the lookup key and the base-language default. Signature:
 * `t(phrase, category?, params?)`. Placeholder names in the phrase are
 * type-checked against the params object at the call site.
 */
export function useT(): TFunction {
    return useSignal(tSignal);
}

/**
 * The locale whose translations are currently loaded. This lags the
 * user-selected locale (`UserLocaleStore`) until the fetch for the new locale
 * settles, which makes it the right value to gate "translations are ready" UI on.
 */
export function useCurrentLocale(): string {
    return useSignal(currentlyLoadedLocale);
}

/**
 * The raw translation catalog. Rarely needed in app code — prefer `useT()`.
 * Exposed for advanced cases (inspecting which categories/phrases are loaded).
 */
export function useTranslations(): iCategories {
    return useSignal(sTranslations);
}

/**
 * All-in-one convenience for the user-locale store. Creates one stable
 * `Signal<string>` (the React analog of Svelte's `writable`), subscribes the
 * component to it, and returns `[locale, setLocale, store]`.
 *
 *   const [locale, setLocale, store] = useLocaleStore('en-US');
 *   useEffect(() => {
 *     LangsysApp.init({ projectid, key, UserLocaleStore: store });
 *   }, [store]);
 *
 *   <select value={locale} onChange={(e) => setLocale(e.target.value)}>...
 *
 * The store is created lazily once and never re-created across renders, so it is
 * safe to pass to `LangsysApp.init` and to depend on in effects.
 */
export function useLocaleStore(initial = 'en-US'): [string, (locale: string) => void, Signal<string>] {
    const [store] = useState(() => createLocaleStore(initial));
    const locale = useSignal(store);
    return [locale, store.set, store];
}

/**
 * Stable server snapshot for `useWriteEnabled`. Must be module-level so its
 * identity never changes across renders.
 */
const writeEnabledServerSnapshot = (): undefined => undefined;

/**
 * Whether the current session may register content, as decided by the server.
 *
 * Tri-state, and the three states are genuinely distinct:
 *   - `undefined` — authorization hasn't landed yet. Not the same as read-only.
 *   - `false`     — read-only session; the SDK reports the page URL instead.
 *   - `true`      — this session registers content directly.
 *
 * Don't collapse it to a boolean and don't default `undefined` to `false`: the
 * same key can be write-enabled from one IP and read-only from another, so only
 * the server can answer, and "not yet known" is a real state to render for.
 *
 * Unlike the other hooks this does *not* go through `useSignal`. `writeEnabled`
 * is browser-authoritative — it is only ever written client-side and stays
 * `undefined` during SSR. Reusing `useSignal` would pass `signal.get` as the
 * server snapshot, and `getServerSnapshot` is used both on the server *and* for
 * the hydration render on the client. If authorization resolved before
 * hydration, that render would disagree with the server HTML and React would
 * throw the markup away. Pinning the server snapshot to `undefined` keeps the
 * hydration pass matching the server; the real value arrives right after.
 */
export function useWriteEnabled(): boolean | undefined {
    return useSyncExternalStore(writeEnabled.subscribe, writeEnabled.get, writeEnabledServerSnapshot);
}
