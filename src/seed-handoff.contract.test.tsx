// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * The seed hand-off (SRV-4, SRV-3): a block the server's scope collects itself — `collected` in
 * `seed.blocks`, handed over with `LangsysApp.seedCatalog(catalog, locale, blocks)` — is never
 * sent from the client, including by the `<Translate>` that renders it.
 *
 * The clause is that the client sends nothing, so it is measured at the transport seam (CONF-2): the
 * tree path's `registerBlock(nodes)` skips a collected block as the core's DOM class does. The
 * API cannot tell "never sent" from "sent and refused", so the absence is read beside a control
 * the same render registers, which the API holds: the wait that saw it store the control would
 * have seen the collected block stored too.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el } from 'react';
import { createRoot } from 'react-dom/client';
import { renderBlock, tokenizeTree } from 'langsys-js-typescript';
import { LangsysApp, Translate, createLocaleStore } from './index.js';
import { toBlockNodes } from './block-nodes.js';
import { anyBlock, startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';
import { everyText } from './test-helpers/contract-held.js';
import seeds from './test-helpers/contract-seeds/seed-handoff.js';
import type { World } from './test-helpers/contract-worlds.js';
import { catalog } from './test-helpers/ssr-scope.js';

let fx: ContractFixture;
let w: World;
const sent: Array<Record<string, unknown>> = [];
const realFetch = globalThis.fetch;
const children = [el('p', null, 'Seeded one'), el('p', null, 'Seeded two')];
let collectedId = '';

beforeAll(async () => {
    fx = await startContractFixture();
    w = seeds.take('base');
    await fx.use(w);
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
        projectid: w.project(),
        key: w.key('k-writer'),
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
        await act(async () =>
            root.render(
                el('div', null,
                    el(Translate, { category: 'UI' }, ...children),
                    // The control: a block of the same render that nothing collected.
                    el(Translate, { category: 'UI' }, el('p', null, 'Control one'), el('p', null, 'Control two')),
                ),
            ),
        );
        const held = () => fx.held(w.key('k-writer'), w.project(), 'es-es');
        await until(async () => (await held()).blocks.UI !== undefined && Object.values((await held()).blocks.UI).some((p) => p.includes('Control one')));
        await sleep(2000);
        expect(sent.filter((i) => i.custom_id === collectedId)).toEqual([]);
        expect(anyBlock(await held())).not.toContain(collectedId);
        // Under no id at all: nothing sent or stored carries the collected block's text.
        expect(sent.filter((i) => JSON.stringify(i).includes('Seeded one'))).toEqual([]);
        expect(everyText(await held())).not.toContain('Seeded one');
        await act(async () => root.unmount());
        host.remove();
    });
});
