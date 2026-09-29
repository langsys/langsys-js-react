// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * VAR-6's Test, end to end: with the transform enabled (the Vite plugin, in this repo's test
 * config), components interpolating a user's value register one phrase with the placeholder
 * across users, measured against the contract fixture's stored state; the placeholder is named
 * per VAR-2; and a plural translation of that phrase renders from the param.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangsysApp, createLocaleStore } from '../index.js';
import { startContractFixture, sleep, type ContractFixture } from '../test-helpers/contract-fixture.js';
import { catalog } from '../test-helpers/ssr-scope.js';
import { Cart, Greeting, Inbox, Signed } from './fixtures/app.js';

let fx: ContractFixture;

beforeAll(async () => {
    fx = await startContractFixture();
    await fx.seed({
        projects: [{ id: 'p1', base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local' }],
        keys: [{ key: 'k-writer', project: 'p1', type: 'write' }],
    });
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await LangsysApp.init({
        projectid: 'p1',
        key: 'k-writer',
        UserLocaleStore: createLocaleStore('en'),
        baseLocale: 'en',
        apiUrl: fx.baseUrl,
    } as never);
});
afterAll(async () => {
    await fx.stop();
});

async function show(node: ReactNode): Promise<string> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(node));
    const text = host.textContent ?? '';
    await sleep(500);
    await act(async () => root.unmount());
    host.remove();
    return text;
}

/** Every string the double stored, as `category:phrase` (a block as its phrases). */
async function stored(): Promise<string[]> {
    const p = (await fx.state()).projects.p1;
    return [
        ...p.phrases.map((x) => `${x.category}:${x.phrase}`),
        ...p.blocks.map((b) => `${b.category}:BLOCK[${b.phrases.map((x) => x.phrase).join('|')}]`),
    ].sort();
}

describe('the placeholder transform, rendered for several users', () => {
    it('each sentence registers once, with its placeholder, and renders each user\'s value', async () => {
        const texts: string[] = [];
        for (const firstName of ['Ana', 'Bo']) texts.push(await show(el(Greeting, { user: { firstName } })));
        for (const n of [1, 3]) texts.push(await show(el(Cart, { items: Array(n).fill(0) })));
        for (const name of ['Ana', 'Bo']) texts.push(await show(el(Signed, { user: { name } })));
        for (const count of [2, 9]) texts.push(await show(el(Inbox, { inbox: { count } })));
        await sleep(1500);

        expect(texts).toEqual([
            'Hello Ana, welcome back',
            'Hello Bo, welcome back',
            'You have 1 items',
            'You have 3 items',
            'Signed in as Ana',
            'Signed in as Bo',
            'You have 2 new messages',
            'You have 9 new messages',
        ]);
        expect(await stored()).toEqual([
            'A:Hello {first_name}, welcome back',
            'B:You have {items_count} items',
            'C:Signed in as {m0o}{name}{m0c}',
            'D:You have {inbox_count} new messages',
        ]);
    }, 60_000);

    it('a plural translation of the registered phrase renders from the param', async () => {
        LangsysApp.seedCatalog(
            catalog({
                B: { 'You have {items_count} items': '{items_count, plural, one {Tienes # artículo} other {Tienes # artículos}}' },
                A: { 'Hello {first_name}, welcome back': 'Hola {first_name}, bienvenido de nuevo' },
            }),
            'es-es',
        );
        expect(await show(el(Cart, { items: [0] }))).toBe('Tienes 1 artículo');
        expect(await show(el(Cart, { items: [0, 0, 0] }))).toBe('Tienes 3 artículos');
        expect(await show(el(Greeting, { user: { firstName: 'Ana' } }))).toBe('Hola Ana, bienvenido de nuevo');
    }, 30_000);
});
