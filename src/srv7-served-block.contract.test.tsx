// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { LangsysApp, Translate, createLocaleStore, currentlyLoadedLocale, type iLangsysInitConfig } from './index.js';
import { renderInRequestScope } from './server.js';
import { anyBlock, startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';
import seeds from './test-helpers/contract-seeds/srv7-served-block.js';
import type { World } from './test-helpers/contract-worlds.js';

/**
 * SRV-7's registration clause, against the API on an SDK test clone (spec CONF-2): a block the
 * server rendered, which the scope's catalog does not hold, is registered by the client with its
 * content, read from the seed or from the hydrated page, so it lands under the id the server
 * rendered, and the next catalog read serves it there.
 *
 * The seam is the core's (`scope.seed()` carries each such block's content; `registerBlock`
 * registers it). This binding's half is the wiring: `renderInRequestScope` hands over the seed,
 * and the `<Translate>` React hydrates registers the block it rendered on the server. One process
 * plays both sides: the server render runs in a request scope, and the page is then seeded from
 * that request's seed and hydrated from its HTML, as README-SSR describes.
 */

let fx: ContractFixture;
let w: World;
const tree = () => el(Translate, { category: 'UI' }, el('p', null, 'Served on the server'), el('p', null, 'And registered by the client'));

beforeAll(async () => {
    fx = await startContractFixture();
    w = seeds.take('served');
    await fx.use(w);
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await LangsysApp.init({
        projectid: w.project(),
        key: w.key('k-writer'),
        UserLocaleStore: createLocaleStore('es-es'),
        baseLocale: 'en',
        apiUrl: fx.baseUrl,
    } as iLangsysInitConfig);
    await until(() => currentlyLoadedLocale.get() === 'es-es');
});
afterAll(async () => {
    await fx.stop();
});

describe('SRV-7 — a block the server rendered and the catalog lacks', () => {
    it('is registered by the hydrated client with its content, under the id the server rendered, and served there', async () => {
        const { result: html, seed, close } = await renderInRequestScope({ locale: 'es-es' }, () => renderToString(tree()));
        const id = /data-ls-contentblock="([^"]+)"/.exec(html)?.[1];
        expect(id).toBeTruthy();
        // The scope's catalog does not hold it, so the seed hands the client its content to register with.
        expect(seed.blocks[id!]).toMatchObject({ customId: id, category: 'UI' });
        expect(seed.blocks[id!]!.content).toContain('Served on the server');
        await close();

        const host = document.createElement('div');
        host.innerHTML = html;
        document.body.appendChild(host);
        LangsysApp.seedCatalog(seed.catalog, seed.locale, seed);
        let root!: ReturnType<typeof hydrateRoot>;
        await act(async () => {
            root = hydrateRoot(host, tree());
        });

        const held = () => fx.held(w.key('k-writer'), w.project(), 'es-es');
        await until(async () => anyBlock(await held()).includes(id!));
        const stored = (await fx.storedBlocks(w, w.key('k-writer'), 'es-es')).find((b) => b.custom_id === id);
        expect(stored).toMatchObject({ custom_id: id, category: 'UI' });
        expect(stored!.content).toContain('Served on the server');
        expect(stored!.content).toContain('And registered by the client');
        // Under that id alone: the block was not stored again under another.
        await sleep(2000);
        expect(anyBlock(await held())).toEqual([id]);

        await act(async () => root.unmount());
        host.remove();
    });
});
