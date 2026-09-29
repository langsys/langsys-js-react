// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * VAR-7: what cannot be recovered is not registered. Without the build transform, a value
 * interpolated in `<Translate>` / `<Phrase>` markup reaches React as a text run split across
 * children; this binding can tell that much but cannot name the value, so the unit registers
 * nothing, while a static unit rendered beside it registers as before. Built with
 * `createElement`, which the build transform does not rewrite. Measured against the contract
 * fixture's stored state, for two users each.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangsysApp, Phrase, Translate, createLocaleStore } from './index.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';

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
    await sleep(400);
    await act(async () => root.unmount());
    host.remove();
    return text;
}

async function stored(): Promise<string[]> {
    const p = (await fx.state()).projects.p1;
    return [
        ...p.phrases.map((x) => `${x.category}:${x.phrase}`),
        ...p.blocks.map((b) => `${b.category}:BLOCK[${b.phrases.map((x) => x.phrase).join('|')}]`),
    ].sort();
}

describe('values the build transform did not rewrite', () => {
    it('register nothing, while a static unit beside them registers', async () => {
        const texts: string[] = [];
        for (const name of ['Ana', 'Bo']) {
            texts.push(await show(el(Translate, { category: 'A' }, 'Hello ', name)));
            texts.push(await show(el(Translate, { category: 'B' }, el('p', null, 'You have ', name.length, ' items'))));
            texts.push(await show(el(Phrase, { category: 'C' }, 'Hi ', name, ', see ', el('b', null, 'this'))));
        }
        texts.push(await show(el(Translate, { category: 'S' }, 'Static sentence')));
        await until(async () => (await stored()).length > 0);
        await sleep(1500);

        expect(texts).toEqual([
            'Hello Ana', 'You have 3 items', 'Hi Ana, see this',
            'Hello Bo', 'You have 2 items', 'Hi Bo, see this',
            'Static sentence',
        ]);
        expect(await stored()).toEqual(['S:Static sentence']);
    }, 60_000);

    // The DOM-class path: a block holding a component falls back to the core's Translate class,
    // which needs the core's `register: false`. Recorded as it.fails until the core honours it.
    it.fails('a fallback block (it holds a component) with an interpolated value registers nothing either', async () => {
        const Badge = () => el('b', null, 'new');
        for (const name of ['Ana', 'Bo']) await show(el(Translate, { category: 'D' }, el('p', null, 'Welcome ', name), el(Badge)));
        await sleep(1500);
        expect((await stored()).filter((s) => s.startsWith('D:'))).toEqual([]);
    }, 60_000);
});
