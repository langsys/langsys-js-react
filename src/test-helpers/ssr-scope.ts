/**
 * Server-render harness for spec SRV-1..5, SRV-7 and MARK-1's SSR route.
 *
 * A `RequestAdapter` is how one server request renders React: it opens whatever request state
 * the implementation has, lets the caller await (a real request loads data between opening and
 * rendering, which is where concurrent requests interleave), renders, and hands back the HTML
 * and the seed the client would hydrate from. The cases in `src/ssr-scope.test.tsx` are written
 * once against this interface; each implementation is one adapter.
 *
 * `coreScopeAdapter` is how this binding renders on a server: one core request scope per
 * request, through `langsys-js-react/server`. `processGlobalAdapter` is the path without it —
 * the core's module-global catalog, seeded per request with `LangsysApp.seedCatalog` — kept as
 * the measured baseline the scope exists to fix.
 */
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { sTranslations } from 'langsys-js-typescript';
import type { iCategories } from 'langsys-js-typescript';
import { LangsysApp } from '../index.js';
import { createRequestScope, installRequestScopeStorage, renderInRequestScope } from '../server.js';

export interface RenderedRequest {
    html: string;
    /** The catalog the server hands the client to hydrate from (SRV-4). */
    seed: iCategories;
}

export interface RequestAdapter {
    name: string;
    /**
     * Serve one request in `locale`. `beforeRender` runs after the request's state is set up and
     * before the render, standing in for the data loading a real request awaits there.
     */
    request(locale: string, node: ReactElement, beforeRender?: () => Promise<void>): Promise<RenderedRequest>;
}

/** Catalogs as the API would serve them, one per locale. */
export type CatalogSource = Record<string, iCategories>;

export function catalog(entries: Record<string, Record<string, string>>): iCategories {
    const out: Record<string, Record<string, string>> = {
        __uncategorized__: { __category__: '__uncategorized__', __symbol__: '__uncategorized__' },
    };
    for (const [category, phrases] of Object.entries(entries)) {
        out[category] = { __category__: category, __symbol__: category, ...phrases };
    }
    return out as unknown as iCategories;
}

/** Today's path: one module-global catalog, seeded at the start of each request. */
export function processGlobalAdapter(source: CatalogSource): RequestAdapter {
    return {
        name: 'process-global seedCatalog',
        async request(locale, node, beforeRender) {
            LangsysApp.seedCatalog(source[locale], locale);
            await beforeRender?.();
            const html = renderToString(node);
            return { html, seed: sTranslations.get() };
        },
    };
}

/** A barrier: every waiter resumes once `release()` is called. */
export function barrier(): { wait: () => Promise<void>; release: () => void } {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    return { wait: () => gate, release };
}

/** The core's request scope (SRV-7), through this binding's server entry. */
export function coreScopeAdapter(source: CatalogSource): RequestAdapter {
    return {
        name: 'core request scope',
        async request(locale, node, beforeRender) {
            const { result, seed, close } = await renderInRequestScope(
                { locale, catalog: source[locale] },
                async () => {
                    await beforeRender?.();
                    return renderToString(node);
                },
            );
            await close();
            return { html: result, seed: seed.catalog };
        },
    };
}

/**
 * The core's request scope entered rather than wrapped (`scope.enter()`), as a host whose render
 * cannot be wrapped in a function uses it. `enter()` is called in the request's own async
 * function, which is the context it makes the scope current in.
 */
export function enteredScopeAdapter(source: CatalogSource): RequestAdapter {
    return {
        name: 'core request scope, entered',
        async request(locale, node, beforeRender) {
            installRequestScopeStorage();
            const scope = await createRequestScope({ locale, catalog: source[locale] });
            scope.enter();
            await beforeRender?.();
            const html = renderToString(node);
            const seed = scope.seed();
            await scope.close();
            return { html, seed: seed.catalog };
        },
    };
}
