// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * MOVE-4 for units nested in a block, on the client: the block holds a component, so it falls back
 * to the core's DOM class and the unit inside it registers itself (`registerBlock` with its host).
 *
 * - Registration: what the client sends for a nested unit, recorded at the `fetch` seam against a
 *   stub that answers like a write-enabled API. No server listens.
 * - Hydration: a nested unit the server rendered from the block's previous category hydrates over
 *   that HTML with no mismatch and keeps its translation.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { currentlyLoadedLocale, sTranslations, type iCategories } from 'langsys-js-typescript';
import { LangsysApp, Phrase, Translate, createLocaleStore } from './index.js';
import { createRequestScope } from './server.js';
import { catalog } from './test-helpers/ssr-scope.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sent: Array<Record<string, unknown>> = [];
const realFetch = globalThis.fetch;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

/** A component child: its DOM is unknown until React renders it, so the block around it falls back. */
const Name = () => el('b', null, 'Ana');

beforeAll(async () => {
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST' && url.includes('/translatable-items')) {
            sent.push(...(JSON.parse(String(init.body)).translatable_items as Array<Record<string, unknown>>));
            return json({ status: true, write_enabled: true });
        }
        if (url.includes('/authorize-project')) return json({ status: true, data: { write_enabled: true } });
        return json({ status: true, write_enabled: true, data: {} });
    }) as typeof fetch;
    await LangsysApp.init({
        projectid: 'p1',
        key: 'k-writer',
        UserLocaleStore: createLocaleStore('en'),
        baseLocale: 'en',
        apiUrl: 'https://api.local',
    } as never);
});
afterAll(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
});

async function mount(node: ReactNode): Promise<void> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(node));
    await sleep(700); // past the core's settle window, so the DOM class and the queue send
    await act(async () => root.unmount());
    host.remove();
}

/** The item sent for `text` in `category`; no category goes as `null`, as the core sends it. */
const of = (category: string, text: string) =>
    sent.find((item) => (item.category ?? '') === category && JSON.stringify(item).includes(text));

describe('the DOM-class fallback: a nested unit registers with the block’s category and previous category', () => {
    it('inherited, own category taking neither, own category with its own previous, and a control', async () => {
        const phrase = (text: string, props: Record<string, unknown> = {}) => el(Phrase, props, `${text} `, el('i', null, 'phrase'));
        const block = (text: string, props: Record<string, unknown> = {}) =>
            el(Translate, props, el('p', null, `${text} block`), el('p', null, `${text} second`));
        await mount(
            el(
                Translate,
                { category: 'Checkout', previousCategory: 'Header' },
                el(Name),
                phrase('Inherits'),
                block('Inherits'),
                phrase('Own', { category: 'Cart' }),
                block('Own', { category: 'Cart' }),
                phrase('OwnMoved', { category: 'Cart', previousCategory: 'Basket' }),
                block('OwnMoved', { category: 'Cart', previousCategory: 'Basket' }),
                phrase('Empty', { category: '' }),
            ),
        );
        // Control: the same units in a block that names no move.
        await mount(el(Translate, { category: 'Plain' }, el(Name), phrase('Control'), block('Control')));
        await sleep(300);

        expect(of('Checkout', 'Inherits {m0o}')).toMatchObject({ previous_category: 'Header' });
        expect(of('Checkout', 'Inherits block')).toMatchObject({ type: 'content_block', previous_category: 'Header' });
        expect(of('Cart', 'Own {m0o}')).toBeDefined();
        expect(of('Cart', 'Own {m0o}')).not.toHaveProperty('previous_category');
        expect(of('Cart', 'Own block')).toBeDefined();
        expect(of('Cart', 'Own block')).not.toHaveProperty('previous_category');
        expect(of('Cart', 'OwnMoved {m0o}')).toMatchObject({ previous_category: 'Basket' });
        expect(of('Cart', 'OwnMoved block')).toMatchObject({ previous_category: 'Basket' });
        // category="" names none: neither the block's category nor its previous one.
        expect(of('', 'Empty {m0o}')).toBeDefined();
        expect(of('', 'Empty {m0o}')).not.toHaveProperty('previous_category');
        expect(of('Checkout', 'Empty {m0o}')).toBeUndefined();
        // Control: a block with no move sends none for the unit inside it.
        expect(of('Plain', 'Control {m0o}')).toBeDefined();
        expect(of('Plain', 'Control {m0o}')).not.toHaveProperty('previous_category');
        expect(of('Plain', 'Control block')).toBeDefined();
        expect(of('Plain', 'Control block')).not.toHaveProperty('previous_category');
    });
});

describe('hydration of a nested unit rendered from the block’s previous category (MOVE-4, MOVE-5)', () => {
    const tree = () =>
        el(
            'div',
            null,
            el(
                Translate,
                { category: 'Checkout', previousCategory: 'Header' },
                el(Name),
                el(Phrase, null, 'Moved ', el('b', null, 'phrase')),
            ),
        );
    const ES = catalog({ Header: { 'Moved {m0o}phrase{m0c}': 'Frase {m0o}movida{m0c}' } });

    it('the server stamps the previous category and the client keeps the translation with no mismatch', async () => {
        const scope = await createRequestScope({ locale: 'es-cr', catalog: ES });
        let html = '';
        scope.run(() => (html = renderToString(tree())));
        expect(html).toContain('data-ls-previous-category="Header"');

        sTranslations.set(ES as unknown as iCategories);
        currentlyLoadedLocale.set('es-cr');
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const recoverable: unknown[] = [];
        let root!: ReturnType<typeof hydrateRoot>;
        await act(async () => {
            root = hydrateRoot(container, tree(), { onRecoverableError: (e) => recoverable.push(e) });
        });
        expect(recoverable).toEqual([]);
        expect(container.textContent).toContain('Frase movida');
        expect(container.querySelector('[data-ls-previous-category="Header"]')).not.toBeNull();
        await act(async () => root.unmount());
        container.remove();
    });
});
