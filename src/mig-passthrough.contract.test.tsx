// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LangsysApp, createLocaleStore, useT, type iLangsysInitConfig } from './index.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';

/**
 * The legacy-key mode (spec MIG) reaches the core through this binding untouched.
 *
 * The mode is the core's: `legacyKeys` is a core init option this binding inherits through its
 * config type, and `useT()` returns the core's `t`. This proves both ends of that pass-through
 * against the contract double: files given to `LangsysApp.init` here change what `useT()`
 * renders and what the double stores, and turning the mode off through the same singleton
 * (`LangsysApp.Translations.setLegacyKeys(null)`) changes both back.
 */

let fx: ContractFixture;
const SEED = {
    projects: [{ id: 'p1', base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local' }],
    keys: [{ key: 'k-writer', project: 'p1', type: 'write' }],
};

// Typed through the binding's own config type: the option is inherited, not declared here.
const LEGACY_KEYS: iLangsysInitConfig['legacyKeys'] = [
    { name: 'en.json', format: 'i18next', data: { checkout: { submit: 'Pay now', title: 'Checkout for {{name}}' } } },
];

const stored = async () => (await fx.state()).projects.p1.phrases;

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
    await fx.seed(SEED);
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await LangsysApp.init({
        projectid: 'p1',
        key: 'k-writer',
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
        await until(async () => (await stored()).some((p) => p.phrase === 'Checkout for {name}'));
        expect((await stored()).find((p) => p.phrase === 'Checkout for {name}')?.category).toBe('checkout');
        await sleep(900);
        expect((await stored()).map((p) => p.phrase)).not.toContain('checkout.title');
        await r.done();
    });

    it('turned off through the same singleton, the same kind of call is literal source text again', async () => {
        LangsysApp.Translations.setLegacyKeys(null);
        const r = await render('checkout.submit');
        expect(r.text).toBe('checkout.submit');
        await until(async () => (await stored()).some((p) => p.phrase === 'checkout.submit'));
        expect((await stored()).map((p) => p.phrase)).not.toContain('Pay now');
        await r.done();
    });
});
