// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * MOVE-1 on the DOM-class fallback: content holding a component renders through the core's
 * `Translate` / `Phrase` classes after mount, and `previousCategory` must reach them too. Recorded
 * at the `fetch` seam, since the contract fixture's accepted state does not keep
 * `previous_category`; the fixture is what answers.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangsysApp, Phrase, Translate, createLocaleStore } from './index.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';

let fx: ContractFixture;
const sent: Array<Record<string, unknown>> = [];
const realFetch = globalThis.fetch;

/** A component child: its DOM is unknown until React renders it, so the block falls back. */
const Name = () => el('b', null, 'Ana');

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
        if (init?.method === 'POST' && String(input).includes('/translatable-items') && init.body) {
            sent.push(...(JSON.parse(String(init.body)).translatable_items as Array<Record<string, unknown>>));
        }
        return realFetch(input as RequestInfo, init);
    }) as typeof fetch;
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

async function mount(node: ReactNode): Promise<void> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(node));
    await sleep(700); // past the core's settle window, so the DOM class registers
    await act(async () => root.unmount());
    host.remove();
}

describe('the DOM-class fallback carries the previous category (MOVE-1)', () => {
    it('for <Translate> and <Phrase>, with an unmoved control of each', async () => {
        await mount(el(Translate, { category: 'Checkout', previousCategory: 'Header' }, el('p', null, 'Moved block for '), el(Name)));
        await mount(el(Phrase, { category: 'Checkout', previousCategory: 'Header' }, 'Moved phrase for ', el(Name)));
        await mount(el(Translate, { category: 'Plain' }, el('p', null, 'Plain block for '), el(Name)));
        await mount(el(Phrase, { category: 'Plain' }, 'Plain phrase for ', el(Name)));
        await until(async () => sent.length >= 4);
        await sleep(500);

        const of = (category: string, text: string) =>
            sent.find((item) => item.category === category && JSON.stringify(item).includes(text));
        expect(of('Checkout', 'Moved block')).toMatchObject({ type: 'content_block', previous_category: 'Header' });
        expect(of('Checkout', 'Moved phrase')).toMatchObject({ previous_category: 'Header' });
        // Controls: sent from the same path, with no previous category.
        expect(of('Plain', 'Plain block')).toBeDefined();
        expect(of('Plain', 'Plain block')).not.toHaveProperty('previous_category');
        expect(of('Plain', 'Plain phrase')).toBeDefined();
        expect(of('Plain', 'Plain phrase')).not.toHaveProperty('previous_category');
    });
});
