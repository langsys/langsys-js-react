// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * MOVE-1 and MOVE-4 on the DOM-class fallback: content holding a component renders through the
 * core's `Translate` / `Phrase` classes after mount, and `previousCategory` must reach them too.
 *
 * Observed in-process, through what the core renders: a catalog that holds the content's
 * translation only under its previous category renders it, from the moved content's host, and
 * the same content with no move does not. The transport is a stand-in with no listening server
 * and the catalog it answers is the test's own, so nothing here claims what a Langsys API does
 * with a move: the clone this repo's contract tests run against stores no previous category, and
 * the request shape is the core's.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { generateCustomId } from 'langsys-js-typescript';
import { LangsysApp, Phrase, Translate, createLocaleStore } from './index.js';
import { sleep } from './test-helpers/contract-fixture.js';
import { STUB_API_URL, stubApi, type StubbedApi } from './test-helpers/stub-api.js';

let api: StubbedApi;

/** A component child: its DOM is unknown until React renders it, so the block falls back. */
const Name = () => el('b', null, 'Ana');

/** The block a `<Translate>` of these texts is, under `category`, as the core keys it. */
const blockId = (category: string, ...texts: string[]) => generateCustomId(category, texts);

beforeAll(async () => {
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    // The catalog holds each text only under the category it moved from: `Header`.
    api = stubApi({
        writeEnabled: false,
        catalog: {
            'es-es': {
                Header: {
                    'Moved phrase for {m0o}Ana{m0c}': 'Frase movida para {m0o}Ana{m0c}',
                    [blockId('Header', 'Moved block for', 'Ana')]: {
                        'Moved block for': 'Bloque movido para',
                        Ana: 'Ana',
                    },
                    'Plain phrase for {m0o}Ana{m0c}': 'Frase simple para {m0o}Ana{m0c}',
                    [blockId('Header', 'Plain block for', 'Ana')]: {
                        'Plain block for': 'Bloque simple para',
                        Ana: 'Ana',
                    },
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
});
afterAll(() => {
    api.restore();
});

async function mount(node: ReactNode): Promise<string> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(node));
    await sleep(700); // past the core's settle window, so the DOM class has rendered from the catalog
    const text = host.textContent ?? '';
    await act(async () => root.unmount());
    host.remove();
    return text;
}

describe('the DOM-class fallback renders from the previous category (MOVE-1, MOVE-4)', () => {
    it('for <Translate> and <Phrase>, with an unmoved control of each', async () => {
        expect(
            await mount(
                el(
                    Translate,
                    { category: 'Checkout', previousCategory: 'Header' },
                    el('p', null, 'Moved block for '),
                    el(Name)
                )
            )
        ).toBe('Bloque movido para Ana');
        expect(
            await mount(el(Phrase, { category: 'Checkout', previousCategory: 'Header' }, 'Moved phrase for ', el(Name)))
        ).toBe('Frase movida para Ana');
        // Controls, through the same path: the same kind of content, in the catalog under `Header`
        // too, with no move named, renders its source.
        expect(await mount(el(Translate, { category: 'Plain' }, el('p', null, 'Plain block for '), el(Name)))).toBe(
            'Plain block for Ana'
        );
        expect(await mount(el(Phrase, { category: 'Plain' }, 'Plain phrase for ', el(Name)))).toBe(
            'Plain phrase for Ana'
        );
    });
});
