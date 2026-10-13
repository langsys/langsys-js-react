import { useContext, useSyncExternalStore } from 'react';
import type { Signal } from 'langsys-js-typescript';
import { SeedScope } from './components/LangsysProvider.js';

/**
 * Subscribe a React component to a base-SDK `Signal<T>` and return its current
 * value, re-rendering whenever the signal changes.
 *
 * This is the React mirror of Svelte's `$store` auto-subscription. Where the
 * Svelte wrapper adapts a native store *into* the SDK (`writable` → `Signal`),
 * the React wrapper adapts the SDK's signals *out* to the render cycle. It is
 * built on `useSyncExternalStore`, so it is concurrent-safe: a render never
 * observes two different values of the same signal (no tearing). On the
 * server the snapshot reads the value for the current request: inside a core
 * request scope the signals answer from the scope, and under a
 * `<LangsysProvider seed>` the server snapshot — used for the server render and
 * the hydration render — reads through the scope the provider rebuilt.
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
    const scope = useContext(SeedScope);
    return useSyncExternalStore(signal.subscribe, signal.get, scope ? () => scope.run(signal.get) : signal.get);
}

// Lives in app.ts, which imports no React, so the server entry exports the same function.
export { createLocaleStore } from './app.js';
