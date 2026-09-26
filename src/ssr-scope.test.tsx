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
import { describe, expect, it } from 'vitest';
import { Translate, useT } from './index.js';
import {
    barrier,
    catalog,
    processGlobalAdapter,
    type CatalogSource,
    type RequestAdapter,
} from './test-helpers/ssr-scope.js';

const SOURCE: CatalogSource = {
    it: catalog({ UI: { Pricing: 'Prezzi' } }),
    de: catalog({ UI: { Pricing: 'Preise' } }),
};

type Case = 'de-then-it' | 'concurrent it and de' | 'MARK-1 SSR route stamps identity';

const ADAPTERS: Array<{ adapter: RequestAdapter; knownFailing: Set<Case> }> = [
    {
        adapter: processGlobalAdapter(SOURCE),
        // Measured: the catalog is one module global, so a request that seeds while another is
        // between seeding and rendering replaces its catalog; and <Translate> stamps only on
        // client mount.
        knownFailing: new Set<Case>(['concurrent it and de', 'MARK-1 SSR route stamps identity']),
    },
];

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

    test('MARK-1 SSR route stamps identity', async () => {
        const r = await adapter.request(
            'it',
            createElement(Translate, { custom_id: 'block-42', children: 'Hello world' }),
        );
        expect(r.html).toContain('data-ls-contentblock="block-42"');
    });
});
