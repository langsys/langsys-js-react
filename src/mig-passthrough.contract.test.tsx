// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LangsysApp, createLocaleStore, useT, type iLangsysInitConfig } from './index.js';
import { anyPhrase, startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';
import { phrasesIn } from './test-helpers/contract-held.js';
import seeds from './test-helpers/contract-seeds/mig-passthrough.js';
import type { World } from './test-helpers/contract-worlds.js';

/**
 * The legacy-key mode (spec MIG) reaches the core through this binding untouched.
 *
 * The mode is the core's: `legacyKeys` is a core init option this binding inherits through its
 * config type, and `useT()` returns the core's `t`. This proves both ends of that pass-through
 * against the API on an SDK test clone (spec CONF-2): files given to `LangsysApp.init` here change
 * what `useT()` renders and what the API stores, read back through its catalog, and turning the
 * mode off through the same singleton (`LangsysApp.Translations.setLegacyKeys(null)`) changes
 * both back.
 */

let fx: ContractFixture;
let w: World;

// Typed through the binding's own config type: the option is inherited, not declared here.
const LEGACY_KEYS: iLangsysInitConfig['legacyKeys'] = [
    { name: 'en.json', format: 'i18next', data: { checkout: { submit: 'Pay now', title: 'Checkout for {{name}}' } } },
];

/** The catalog the API serves the project's key: what it accepted. */
const held = () => fx.held(w.key('k-writer'), w.project(), 'es-es');
const storedAnywhere = async () => anyPhrase(await held());

function Line({ k, params }: { k: string; params?: Record<string, string> }) {
    const t = useT() as (phrase: string, category?: string, params?: Record<string, string>) => string;
    return createElement('p', null, t(k, undefined, params));
}

async function render(k: string, params?: Record<string, string>): Promise<{ text: string; done: () => Promise<void> }> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(Line, { k, params })));
    return {
        text: host.textContent ?? '',
        done: async () => {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}

beforeAll(async () => {
    fx = await startContractFixture();
    w = seeds.take('base');
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
        legacyKeys: LEGACY_KEYS,
    } as iLangsysInitConfig);
});
afterAll(async () => {
    await fx.stop();
});

describe('MIG — the legacy-key mode passes through this binding', () => {
    it('with legacyKeys given to init, useT() resolves a key to its converted value, and that is what registers', async () => {
        const r = await render('checkout.title', { name: 'Ada' });
        expect(r.text).toBe('Checkout for Ada');
        await until(async () => phrasesIn(await held(), 'checkout').includes('Checkout for {name}'));
        await sleep(2000);
        expect(await storedAnywhere()).not.toContain('checkout.title');
        await r.done();
    });

    it('turned off through the same singleton, the same kind of call is literal source text again', async () => {
        LangsysApp.Translations.setLegacyKeys(null);
        const r = await render('checkout.submit');
        expect(r.text).toBe('checkout.submit');
        await until(async () => (await storedAnywhere()).includes('checkout.submit'));
        expect(await storedAnywhere()).not.toContain('Pay now');
        await r.done();
    });
});
