/**
 * Server-render harness for spec SRV-1..5, SRV-7 and MARK-1's SSR route.
 *
 * A `RequestAdapter` is how one server request renders React: it opens whatever request state
 * the implementation has, lets the caller await (a real request loads data between opening and
 * rendering, which is where concurrent requests interleave), renders, and hands back the HTML
 * and the seed the client would hydrate from. The cases in `src/ssr-scope.test.tsx` are written
 * once against this interface; each implementation is one adapter.
 *
 * `processGlobalAdapter` is what this binding has today: the core's module-global catalog,
 * seeded per request with `LangsysApp.seedCatalog`. The core's request scope (SRV-7) gets its
 * own adapter when it lands, built from its API and nothing else.
 */
import type { ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { sTranslations } from 'langsys-js-typescript';
import type { iCategories } from 'langsys-js-typescript';
import { LangsysApp } from '../index.js';

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
