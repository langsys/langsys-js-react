// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * A new `tag` on a mounted `<Translate>` or `<Phrase>` makes React replace the host element. What
 * the component bound to the old host follows it to the new one: the DOM-class fallback translates
 * the new host, and a tree-rendered `<Translate>` claims it (MARK-2), so an enclosing fallback
 * block's walk leaves it alone (a phrase's host that walk skips in any case). In-process, through a
 * stand-in transport and the test's own catalog.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { generateCustomId } from 'langsys-js-typescript';
import { LangsysApp, Phrase, Translate, createLocaleStore, currentlyLoadedLocale } from './index.js';
import { sleep, until } from './test-helpers/contract-fixture.js';
import { STUB_API_URL, stubApi, type StubbedApi } from './test-helpers/stub-api.js';

let api: StubbedApi;

/** A component child: its DOM is unknown until React renders it, so the unit falls back to the DOM class. */
const Name = () => el('b', null, 'Ana');
const Badge = () => el('span', null, 'New');

beforeAll(async () => {
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    api = stubApi({
        catalog: {
            'es-es': {
                UI: {
                    'Plain phrase for {m0o}Ana{m0c}': 'Frase simple para {m0o}Ana{m0c}',
                    [generateCustomId('UI', ['Plain block for', 'Ana'])]: { 'Plain block for': 'Bloque simple para', Ana: 'Ana' },
                },
            },
        },
    });
    await LangsysApp.init({
        projectid: 'stub-project',
        key: 'stub-key',
        UserLocaleStore: createLocaleStore('es-es'),
        baseLocale: 'en',
        apiUrl: STUB_API_URL,
    } as never);
    await until(() => currentlyLoadedLocale.get() === 'es-es', 8000, 25);
});
afterAll(() => {
    api.restore();
});

async function mount(): Promise<{ host: HTMLElement; root: Root; render: (node: ReactNode) => Promise<void> }> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const render = async (node: ReactNode) => {
        await act(async () => root.render(node));
        await sleep(700); // past the core's settle window
    };
    return { host, root, render };
}

describe('a new tag on a mounted unit', () => {
    it('the DOM-class fallback translates the new host, for <Translate> and <Phrase>', async () => {
        const { host, root, render } = await mount();
        const tree = (blockTag: string, phraseTag: string) =>
            el(
                'div',
                null,
                el(Translate, { category: 'UI', tag: blockTag }, 'Plain block for ', el(Name)),
                el(Phrase, { category: 'UI', tag: phraseTag }, 'Plain phrase for ', el(Name)),
            );
        await render(tree('div', 'span'));
        expect(host.textContent).toContain('Bloque simple para');
        expect(host.textContent).toContain('Frase simple para');

        await render(tree('section', 'em'));
        expect(host.querySelector('section')?.textContent).toContain('Bloque simple para');
        expect(host.querySelector('em')?.textContent).toContain('Frase simple para');

        await act(async () => root.unmount());
        host.remove();
    });

    it('a tree-rendered unit nested in a fallback block claims its new host, so the block never takes it over', async () => {
        const { host, root, render } = await mount();
        const tree = (blockTag: string, phraseTag: string) =>
            el(
                Translate,
                { category: 'UI' },
                el('p', null, 'Gallery'),
                el(Badge),
                el(Translate, { category: 'UI', tag: blockTag, params: { name: 'Ana' } }, el('p', null, 'Taken by %name%')),
                el(Phrase, { category: 'UI', tag: phraseTag, params: { name: 'Ana' } }, 'Shared by ', el('b', null, '%name%')),
            );
        const withValue = () => api.items().filter((i) => JSON.stringify(i).includes('Ana'));
        await render(tree('div', 'span'));
        await sleep(1500);
        expect(withValue()).toEqual([]); // control: the first hosts are claimed
        await render(tree('section', 'span'));
        await sleep(1500);
        // Taken over, a nested host would be read as the block's own content, its value with it.
        expect(withValue()).toEqual([]);
        await render(tree('section', 'em'));
        await sleep(1500);
        expect(withValue()).toEqual([]);
        expect(host.querySelector('section')?.textContent).toBe('Taken by Ana');
        expect(host.querySelector('em')?.textContent).toBe('Shared by Ana');

        await act(async () => root.unmount());
        host.remove();
    }, 20_000);
});
