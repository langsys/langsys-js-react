/**
 * Server rendering per request (spec SRV-1, SRV-2, SRV-4, SRV-7) and MARK-1's SSR route,
 * written once against `RequestAdapter` and run for every implementation this binding has.
 *
 * `KNOWN_FAILING` records, per adapter, the cases it is measured to fail. Those run as
 * `it.fails`, so they stay visible as failures, and a case that starts passing turns red until
 * its row in CONFORMANCE.md is re-graded. The core's request scope is added as an adapter with
 * no known failures when it lands.
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LangsysApp, Translate, useCurrentLocale, useT, useTranslations } from './index.js';
import {
    barrier,
    catalog,
    coreScopeAdapter,
    enteredScopeAdapter,
    processGlobalAdapter,
    type CatalogSource,
    type RequestAdapter,
} from './test-helpers/ssr-scope.js';
import { renderInRequestScope } from './server.js';

const SOURCE: CatalogSource = {
    it: catalog({ UI: { Pricing: 'Prezzi', 'Hello world': 'Ciao mondo' } }),
    de: catalog({ UI: { Pricing: 'Preise', 'Hello world': 'Hallo Welt' } }),
};

type Case =
    | 'de-then-it'
    | 'concurrent it and de'
    | 'locale and catalog hooks follow the request'
    | 'MARK-1 SSR route stamps an explicit custom_id'
    | 'MARK-1 SSR route stamps a content-derived id'
    | 'block content is translated on the server';

const ADAPTERS: Array<{ adapter: RequestAdapter; knownFailing: Set<Case> }> = [
    {
        adapter: coreScopeAdapter(SOURCE),
        // Measured: the scope isolates t(), but the core's currentlyLoadedLocale and sTranslations
        // still read the process global inside it; and the core's block path is DOM-only, so a
        // <Translate> on a server has no derived id and renders its source text.
        knownFailing: new Set<Case>([
            'locale and catalog hooks follow the request',
            'MARK-1 SSR route stamps a content-derived id',
            'block content is translated on the server',
        ]),
    },
    {
        adapter: enteredScopeAdapter(SOURCE),
        // The same measurements as the wrapped scope.
        knownFailing: new Set<Case>([
            'locale and catalog hooks follow the request',
            'MARK-1 SSR route stamps a content-derived id',
            'block content is translated on the server',
        ]),
    },
    {
        adapter: processGlobalAdapter(SOURCE),
        // Measured: the catalog is one module global, so a request that seeds while another is
        // between seeding and rendering replaces its catalog.
        knownFailing: new Set<Case>([
            'concurrent it and de',
            'locale and catalog hooks follow the request',
            'MARK-1 SSR route stamps a content-derived id',
            'block content is translated on the server',
        ]),
    },
];

function Everything() {
    const catalogNow = useTranslations() as unknown as Record<string, Record<string, string>>;
    return createElement('p', null, `${useT()('Pricing', 'UI')}|${useCurrentLocale()}|${catalogNow.UI?.Pricing}`);
}

function Price() {
    return createElement('p', null, useT()('Pricing', 'UI'));
}

describe.each(ADAPTERS)('$adapter.name', ({ adapter, knownFailing }) => {
    const test = (name: Case, fn: () => Promise<void>) => (knownFailing.has(name) ? it.fails : it)(name, fn);

    test('de-then-it', async () => {
        const de = await adapter.request('de', createElement(Price));
        expect(de.html).toBe('<p>Preise</p>');
        const it_ = await adapter.request('it', createElement(Price));
        expect(it_.html).toBe('<p>Prezzi</p>');
        expect(it_.html).not.toContain('Preise');
    });

    test('concurrent it and de', async () => {
        // Both requests are set up before either renders, as two visitors' requests are when
        // each awaits its data.
        const gate = barrier();
        const pending = [
            adapter.request('it', createElement(Price), gate.wait),
            adapter.request('de', createElement(Price), gate.wait),
        ];
        gate.release();
        const [it_, de] = await Promise.all(pending);
        expect(it_.html).toBe('<p>Prezzi</p>');
        expect(de.html).toBe('<p>Preise</p>');
        // Each request hands the client its own catalog to hydrate from.
        expect(JSON.stringify(it_.seed)).toContain('Prezzi');
        expect(JSON.stringify(it_.seed)).not.toContain('Preise');
    });

    test('locale and catalog hooks follow the request', async () => {
        // Another visitor's catalog is current in the process while this request renders.
        LangsysApp.seedCatalog(SOURCE.de, 'de');
        const gate = barrier();
        const pending = [
            adapter.request('it', createElement(Everything), gate.wait),
            adapter.request('de', createElement(Price), gate.wait),
        ];
        gate.release();
        const [it_] = await Promise.all(pending);
        expect(it_.html).toBe('<p>Prezzi|it|Prezzi</p>');
    });

    test('MARK-1 SSR route stamps an explicit custom_id', async () => {
        const r = await adapter.request(
            'it',
            createElement(Translate, { custom_id: 'block-42', category: 'UI', children: 'Hello world' }),
        );
        expect(r.html).toContain('data-ls-contentblock="block-42"');
    });

    test('MARK-1 SSR route stamps a content-derived id', async () => {
        const r = await adapter.request('it', createElement(Translate, { category: 'UI', children: 'Hello world' }));
        expect(r.html).toMatch(/data-ls-contentblock="[^"]+"/);
    });

    test('block content is translated on the server', async () => {
        const r = await adapter.request('it', createElement(Translate, { category: 'UI', children: 'Hello world' }));
        expect(r.html).toContain('Ciao mondo');
    });
});

describe('langsys-js-react/server — closing after the response (SRV-3)', () => {
    it('the render records its misses in the scope, and close() is left to the caller', async () => {
        const { result, close } = await renderInRequestScope({ locale: 'it', catalog: SOURCE.it }, (scope) => {
            const html = renderToString(createElement(Missing));
            expect(scope.misses()).toContainEqual({ category: 'UI', phrase: 'Not in the catalog' });
            return html;
        });
        expect(result).toBe('<p>Not in the catalog</p>');
        const first = await close();
        // No session may write in this process, so the core leaves the misses to the client.
        expect(first).toMatchObject({ status: false, skipped: true });
        expect(await close()).toBe(first);
    });
});

function Missing() {
    return createElement('p', null, useT()('Not in the catalog', 'UI'));
}
