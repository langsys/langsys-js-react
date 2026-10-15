// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * A write session registers on the base locale, and the visitor switches language before the
 * registration answers. The switched catalog's translations render through `<Translate>`,
 * `<Phrase>` and `t()`: the core's record of a registration marks only an entry the catalog does
 * not already hold.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el } from 'react';
import { createRoot } from 'react-dom/client';
import { generateCustomId } from 'langsys-js-typescript';
import { LangsysApp, Phrase, Translate, createLocaleStore, currentlyLoadedLocale, useT } from './index.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';

let fx: ContractFixture;

const PROJECT = { id: 'p1', base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local' };
const KEYS = [{ key: 'k-writer', project: 'p1', type: 'write' }];
const BLOCK_ID = generateCustomId('SW', ['A caption', 'Another line']);
// The content as a translator has left it by the time the visitor switches language.
const TRANSLATED = {
    projects: [
        {
            ...PROJECT,
            phrases: [
                { category: 'UI', phrase: 'Welcome back', translations: { 'es-es': 'Bienvenido de nuevo' } },
                { category: 'UI', phrase: 'Good morning', translations: { 'es-es': 'Buenos días' } },
            ],
            blocks: [
                {
                    category: 'SW',
                    custom_id: BLOCK_ID,
                    phrases: [
                        { phrase: 'A caption', translations: { 'es-es': 'Un pie de foto' } },
                        { phrase: 'Another line', translations: { 'es-es': 'Otra línea' } },
                    ],
                },
            ],
        },
    ],
    keys: KEYS,
};

function Greeting() {
    const t = useT();
    return el('span', null, t('Good morning', 'UI'));
}

beforeAll(async () => {
    fx = await startContractFixture();
    await fx.seed({ projects: [PROJECT], keys: KEYS });
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
            projectid: 'p1',
            key: 'k-writer',
            UserLocaleStore: locale,
            baseLocale: 'en',
            apiUrl: fx.baseUrl,
        } as never);
        await until(() => currentlyLoadedLocale.get() === 'en');
        // A registration answers only after 800ms, as on a slow network. Each answer records the
        // locale loaded when it arrived.
        const real = globalThis.fetch;
        const answeredUnder: string[] = [];
        vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
            if (!String(url).includes('/translatable-items')) return real(url, init);
            await sleep(800);
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

        await sleep(500);
        await fx.seed(TRANSLATED);
        await act(async () => locale.set('es-es'));
        await until(() => currentlyLoadedLocale.get() === 'es-es');
        await act(async () => sleep(1500));

        // The race this covers: the first registration answered after the switch's catalog loaded.
        expect(answeredUnder[0]).toBe('es-es');
        expect(host.textContent).toBe('Un pie de fotoOtra líneaBienvenido de nuevoBuenos días');

        await act(async () => root.unmount());
        host.remove();
    }, 30_000);
});
