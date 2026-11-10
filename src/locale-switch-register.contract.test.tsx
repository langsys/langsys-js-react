// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * A write session registers on the base locale, and the visitor switches language before the
 * registration answers. The switched catalog's translations render through `<Translate>`,
 * `<Phrase>` and `t()`: the core's record of a registration marks only an entry the catalog does
 * not already hold.
 *
 * Run against the API on an SDK test clone (spec CONF-2). The translator's work is the case's own
 * call to the API's registration route, under the project's write key, carrying the translations
 * an import carries (MIG-9): the API stores them as the project's, and the switched catalog
 * serves them. What renders is the API's catalog answer, and the content is read back from it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el } from 'react';
import { createRoot } from 'react-dom/client';
import { generateCustomId } from 'langsys-js-typescript';
import { LangsysApp, Phrase, Translate, createLocaleStore, currentlyLoadedLocale, useT } from './index.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';
import { everyText } from './test-helpers/contract-held.js';
import seeds from './test-helpers/contract-seeds/locale-switch.js';
import type { World } from './test-helpers/contract-worlds.js';

let fx: ContractFixture;
let w: World;

const BLOCK_ID = generateCustomId('SW', ['A caption', 'Another line']);
// The content as a translator has left it by the time the visitor switches language, as an import
// registers it: each phrase with the translations already held for it.
const TRANSLATED = (projectId: string) => ({
    project_id: projectId,
    translatable_items: [
        { type: 'phrase', category: 'UI', phrase: 'Welcome back', translations: [{ locale: 'es-es', translation: 'Bienvenido de nuevo' }] },
        { type: 'phrase', category: 'UI', phrase: 'Good morning', translations: [{ locale: 'es-es', translation: 'Buenos días' }] },
        {
            type: 'content_block',
            category: 'SW',
            custom_id: BLOCK_ID,
            content: '<p>A caption</p><p>Another line</p>',
            phrases: [
                { phrase: 'A caption', translations: [{ locale: 'es-es', translation: 'Un pie de foto' }] },
                { phrase: 'Another line', translations: [{ locale: 'es-es', translation: 'Otra línea' }] },
            ],
        },
    ],
});

function Greeting() {
    const t = useT();
    return el('span', null, t('Good morning', 'UI'));
}

beforeAll(async () => {
    fx = await startContractFixture();
    w = seeds.take('base');
    await fx.use(w);
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
});
afterAll(async () => {
    vi.unstubAllGlobals();
    await fx.stop();
});

describe('a registration answered after a locale switch', () => {
    it('leaves the switched catalog’s translations rendering, for a block, a phrase and t()', async () => {
        const locale = createLocaleStore('en');
        await LangsysApp.init({
            projectid: w.project(),
            key: w.key('k-writer'),
            UserLocaleStore: locale,
            baseLocale: 'en',
            apiUrl: fx.baseUrl,
        } as never);
        await until(() => currentlyLoadedLocale.get() === 'en');
        // A registration is sent only after 4s, as on a slow network, so the translator's work and
        // the switch both land before it. Each answer records the locale loaded when it arrived.
        const real = globalThis.fetch;
        const answeredUnder: string[] = [];
        vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
            if (!String(url).includes('/translatable-items')) return real(url, init);
            await sleep(4000);
            const res = await real(url, init);
            answeredUnder.push(currentlyLoadedLocale.get());
            return res;
        });

        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () =>
            root.render([
                el(Translate, { key: 'b', category: 'SW' }, el('p', null, 'A caption'), el('p', null, 'Another line')),
                el(Phrase, { key: 'p', category: 'UI' }, 'Welcome back'),
                el(Greeting, { key: 't' }),
            ])
        );
        expect(host.textContent).toBe('A captionAnother lineWelcome backGood morning');

        // The translator's work is accepted by the API before the visitor switches.
        const imported = await fx.api('/translatable-items', { key: w.key('k-writer'), method: 'POST', body: TRANSLATED(w.project()) });
        expect(imported.status, JSON.stringify(imported.body)).toBeLessThan(300);
        await act(async () => locale.set('es-es'));
        await until(() => currentlyLoadedLocale.get() === 'es-es');
        expect(answeredUnder, 'the SDK’s registration has not been answered yet').toEqual([]);

        // The race this covers: the first registration answered after the switch's catalog loaded.
        await until(() => answeredUnder.length > 0, 20_000);
        await act(async () => sleep(1500));
        expect(answeredUnder[0]).toBe('es-es');
        expect(host.textContent).toBe('Un pie de fotoOtra líneaBienvenido de nuevoBuenos días');
        // What the page shows is what the API holds: the content and its translations are stored.
        expect(everyText(await fx.held(w.key('k-writer'), w.project(), 'es-es'))).toEqual(
            expect.arrayContaining(['A caption', 'Another line', 'Welcome back', 'Good morning']),
        );

        await act(async () => root.unmount());
        host.remove();
    });
});
