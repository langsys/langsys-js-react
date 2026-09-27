/**
 * langsys-js-react/server — server rendering through the core's request scope (spec SRV-7).
 *
 * Server-only: it imports `node:async_hooks`, which is why it is its own entry and never part of
 * the main bundle. The scope is the core's — its locale, its view of the catalog, its misses and
 * its hydration seed. This module gives the core an `AsyncLocalStorage`, so a scope stays
 * current across every `await` in a render, and opens a scope around one request's render.
 * It keeps no request state of its own.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import {
    createRequestScope,
    setRequestScopeStorage,
    type RegistrationResult,
    type RequestScope,
    type RequestScopeOptions,
    type iCategories,
} from 'langsys-js-typescript';

export {
    clearSharedCatalogs,
    createRequestScope,
    currentRequestScope,
    setRequestScopeStorage,
    type RequestScope,
    type RequestScopeOptions,
    type ScopeMiss,
    type ScopeStorage,
} from 'langsys-js-typescript';

let storageInstalled = false;

/**
 * Give the core the `AsyncLocalStorage` an async render needs. `renderInRequestScope` calls it
 * for you; call it yourself once at startup when you open scopes with `createRequestScope` and
 * `scope.enter()`. `enter()` holds only in the continuation that itself renders: called in a
 * function the host awaits and returns from, it is lost on return. Idempotent.
 */
export function installRequestScopeStorage(): void {
    if (storageInstalled) return;
    setRequestScopeStorage(new AsyncLocalStorage());
    storageInstalled = true;
}

export interface RenderedInScope<T> {
    result: T;
    /** Serialise into the page; on the client call `LangsysApp.seedCatalog(seed.catalog, seed.locale)` before hydrating. */
    seed: { locale: string; catalog: iCategories };
    /** Call after the response has been sent: hands this request's misses to the core to send (SRV-3). */
    close: () => Promise<RegistrationResult>;
}

/**
 * Render one request inside its own scope. Everything the render reads through the core —
 * `useT()`, `LangsysApp.t` — resolves to this request's locale and catalog, across `await`.
 *
 *   const { result: html, seed, close } = await renderInRequestScope(
 *       { locale, url: req.url },
 *       () => renderToString(<App />),
 *   );
 *   res.send(page(html, seed));
 *   await close();
 */
export async function renderInRequestScope<T>(
    options: RequestScopeOptions,
    render: (scope: RequestScope) => T | Promise<T>,
): Promise<RenderedInScope<T>> {
    installRequestScopeStorage();
    const scope = await createRequestScope(options);
    const result = await scope.run(() => render(scope));
    return { result, seed: scope.seed(), close: () => scope.close() };
}
