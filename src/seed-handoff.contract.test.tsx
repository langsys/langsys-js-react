// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * The seed hand-off (SRV-4, SRV-3): a block the server's scope collects itself — `collected` in
 * `seed.blocks`, handed over with `LangsysApp.seedCatalog(catalog, locale, blocks)` — is never
 * sent from the client, including by the `<Translate>` that renders it.
 *
 * Measured at the transport seam: the tree path's `registerBlock(nodes)` skips a collected block
 * as the core's DOM class does.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el } from 'react';
import { createRoot } from 'react-dom/client';
import { renderBlock, tokenizeTree } from 'langsys-js-typescript';
import { LangsysApp, Translate, createLocaleStore } from './index.js';
import { toBlockNodes } from './block-nodes.js';
import { startContractFixture, sleep, type ContractFixture } from './test-helpers/contract-fixture.js';
import { catalog } from './test-helpers/ssr-scope.js';

let fx: ContractFixture;
const sent: Array<Record<string, unknown>> = [];
const realFetch = globalThis.fetch;
const children = [el('p', null, 'Seeded one'), el('p', null, 'Seeded two')];
let collectedId = '';

beforeAll(async () => {
    fx = await startContractFixture();
    await fx.seed({
        projects: [{ id: 'p1', base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local' }],
        keys: [{ key: 'k-writer', project: 'p1', type: 'write' }],
    });
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/translatable-items') && typeof init?.body === 'string') {
            sent.push(...(JSON.parse(init.body).translatable_items as Array<Record<string, unknown>>));
        }
        return realFetch(input, init);
    }) as typeof fetch;

    // The seed a server scope hands over when it collects the block itself.
    const mapped = toBlockNodes(children);
    if (!mapped.ok) throw new Error(mapped.reason);
    collectedId = renderBlock(mapped.nodes, { category: 'UI' }).customId!;
    const { tokens } = tokenizeTree(mapped.nodes);
    LangsysApp.seedCatalog(catalog({ UI: {} }), 'en', {
        blocks: { [collectedId]: { customId: collectedId, category: 'UI', tokens, shape: 'block', collected: true } },
    });
    await LangsysApp.init({
        projectid: 'p1',
        key: 'k-writer',
        UserLocaleStore: createLocaleStore('en'),
        baseLocale: 'en',
        apiUrl: fx.baseUrl,
    } as never);
});
afterAll(async () => {
    globalThis.fetch = realFetch;
    await fx.stop();
});

describe('a server-collected block', () => {
    it('is never sent from the client, by the <Translate> that renders it', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () => root.render(el(Translate, { category: 'UI' }, ...children)));
        await sleep(2000);
        expect(sent.filter((i) => i.custom_id === collectedId)).toEqual([]);
        await act(async () => root.unmount());
        host.remove();
    });
});
