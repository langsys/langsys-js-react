import { createContext, createElement, useContext, useInsertionEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { LangsysApp, scopeFromSeed, type RequestScope, type RequestSeed } from 'langsys-js-typescript';

/**
 * The request scope a `<LangsysProvider>` rebuilt from its seed, for the renders that must match
 * the server's HTML: the server render itself and the client's hydration render.
 */
export const SeedScope = createContext<RequestScope | null>(null);

const noSubscription = () => () => {};

/**
 * True during a server render and the client's hydration render, false once hydrated. React
 * uses a store's server snapshot for exactly those two renders, so this is how a component
 * knows to read the request's scope rather than the page's state, with no environment check.
 */
export function useServerSnapshotWindow(): boolean {
    return useSyncExternalStore(
        noSubscription,
        () => false,
        () => true,
    );
}

/** Run `fn` inside the seed's scope while the server snapshot is in use; otherwise as-is. */
export function useSeedScopeRunner(): <T>(fn: () => T) => T {
    const scope = useContext(SeedScope);
    const inWindow = useServerSnapshotWindow();
    return scope && inWindow ? (fn) => scope.run(fn) : (fn) => fn();
}

export interface LangsysProviderProps {
    /** The request's seed, from `scope.seed()` in a server component, passed down as a prop. */
    seed: RequestSeed | null | undefined;
    children?: ReactNode;
}

/**
 * Renders a request in its own locale and catalog where the framework renders client
 * components separately from the code that opened the request's scope — Next.js's App Router,
 * where server components and client components use separate copies of the SDK.
 *
 *   // app/layout.tsx (a server component)
 *   const scope = await createRequestScope({ locale, url });   // from langsys-js-react/server
 *   return <LangsysProvider seed={scope.seed()}>{children}</LangsysProvider>;
 *
 * On the server, the provider rebuilds the request's scope from the seed with the core's
 * `scopeFromSeed` and hands it down: `useT()`, `useCurrentLocale()`, `useTranslations()`,
 * `<Translate>` and `<Phrase>` render from it. In the browser it seeds the SDK with the same
 * catalog before any child's effect runs, and the hydration render reads the same scope, so the
 * client's first render matches the server's HTML.
 *
 * Content a client component misses during the server render is registered by the browser after
 * hydration. Under the `server` SSR strategy those misses are not sent from the server: the
 * provider's side of the render has no after-response hook.
 */
export function LangsysProvider({ seed, children }: LangsysProviderProps) {
    const [scope] = useState<RequestScope | null>(() => (seed ? scopeFromSeed(seed) : null));

    // Browser only (insertion effects never run on a server), and before any child's effect.
    useInsertionEffect(() => {
        if (seed) LangsysApp.seedCatalog(seed.catalog, seed.locale, seed);
        // The seed is the request's; it is applied once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return createElement(SeedScope.Provider, { value: scope }, children);
}
