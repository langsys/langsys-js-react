import { useSyncExternalStore } from 'react';
import { createSignal, type Signal } from 'langsys-js-typescript';

/**
 * Subscribe a React component to a base-SDK `Signal<T>` and return its current
 * value, re-rendering whenever the signal changes.
 *
 * This is the React mirror of Svelte's `$store` auto-subscription. Where the
 * Svelte wrapper adapts a native store *into* the SDK (`writable` → `Signal`),
 * the React wrapper adapts the SDK's signals *out* to the render cycle. It is
 * built on `useSyncExternalStore`, so it is concurrent-safe and SSR-safe — the
 * server snapshot reads the same `.get()`, which the base SDK seeds from
 * `initialTranslations` during SSR.
 *
 * The base SDK's signals are stable between changes (every `set` replaces the
 * value, so `.get()` returns a fresh reference only after a real change). That
 * is exactly the identity contract `useSyncExternalStore` requires — no tearing,
 * no render loops.
 *
 * `signal` must be stable across renders: a module-level singleton (the SDK's
 * `t` / `currentlyLoadedLocale` / `sTranslations`) or one created once with
 * `useState(() => createLocaleStore(...))`. Passing a freshly-created signal on
 * every render would resubscribe on every render.
 */
export function useSignal<T>(signal: Signal<T>): T {
    return useSyncExternalStore(signal.subscribe, signal.get, signal.get);
}

/**
 * Create a reactive `Signal<string>` to hold the user's selected locale — the
 * React analog of Svelte's `writable('en-us')`.
 *
 * Pass the result as `UserLocaleStore` to `LangsysApp.init`, read it reactively
 * with `useSignal(store)` (or use the all-in-one `useLocaleStore` hook), and
 * switch locale with `store.set('fr-fr')`. The base SDK only ever reads and
 * subscribes to it — it never writes.
 */
export function createLocaleStore(initial = 'en-us'): Signal<string> {
    return createSignal<string>(initial);
}
