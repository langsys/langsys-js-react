// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { generateCustomId } from 'langsys-js-typescript';
import { LangsysApp, Phrase, Translate, createLocaleStore, currentlyLoadedLocale, inCategory, sTranslations, useT, type iLangsysInitConfig } from './index.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';
import seeds, { MOVED_BLOCK } from './test-helpers/contract-seeds/move-categories.js';
import type { World } from './test-helpers/contract-worlds.js';

/**
 * MOVE-1, MOVE-3 and MOVE-4 through this binding, against an API on an SDK test clone that stores
 * `previous_category` (spec CONF-2). Content translated under `Header` is rendered under
 * `Checkout` naming `Header` as its previous category, through each React surface that takes a
 * category: `<Phrase previousCategory>`, `<Translate previousCategory>` and `t()` with the core's
 * `inCategory()`.
 *
 * - MOVE-4: each renders the `Header` translation the catalog holds, while `Checkout` holds none.
 * - MOVE-1: each registers under `Checkout` with `previous_category` `Header`, read back as the API
 *   answers it: the item `Checkout` now serves holds `Header`'s translation as its own, which the
 *   API copies only for an item registered with that previous category. The catalog's data form
 *   tells the two apart: it also serves an untranslated item the translation of the same text in
 *   another category, flagged `memory_translated`. The control, a phrase translated under `Header`
 *   and rendered under `Checkout` naming none, holds no translation of its own.
 * - MOVE-3: once the refreshed catalog holds the moved items, a later render sends nothing.
 *
 * The decisions are the core's; this binding's half is handing each surface's previous category
 * to it. Every item sent is also read at the transport seam.
 */

let fx: ContractFixture;
let w: World;
const sent: Array<Record<string, unknown>> = [];
const realFetch = globalThis.fetch;
const BLOCK_ID = generateCustomId('Checkout', ['Moved block', 'Second paragraph']);

function SignIn() {
    const t = useT() as (phrase: string, category: unknown) => string;
    return el('span', { id: 'call' }, t('Sign in', inCategory('Checkout', { previousCategory: 'Header' })));
}
const page = () =>
    el(
        'div',
        null,
        el('p', { id: 'phrase' }, el(Phrase, { category: 'Checkout', previousCategory: 'Header' }, 'Buy now')),
        el('p', null, el(SignIn)),
        el('section', { id: 'block' }, el(Translate, { category: 'Checkout', previousCategory: 'Header' }, ...MOVED_BLOCK)),
        el('p', { id: 'control' }, el(Phrase, { category: 'Checkout' }, 'Not moved')),
    );

async function mount(node: ReactNode) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(node));
    const text = (id: string) => host.querySelector(`#${id}`)?.textContent ?? '';
    return {
        text,
        unmount: async () => {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}

/** One item as the catalog's data form serves it; a block's phrases are its `translations`. */
interface Row {
    type: 'phrase' | 'content_block';
    phrase: string | null;
    custom_id: string | null;
    translation: string | null;
    memory_translated: boolean;
    translations: Row[] | null;
}

/** What the catalog serves at es-es under `category`, in its data form, read by the test under the case's key. */
async function served(category: string): Promise<Row[]> {
    const { body } = await fx.api(`/translations/data?project_id=${encodeURIComponent(w.project())}&locale=es-es`, { key: w.key('k-writer') });
    return (body?.data?.[category] ?? []) as Row[];
}
const phraseRow = (rows: Row[], phrase: string) => rows.find((r) => r.type === 'phrase' && r.phrase === phrase);
const blockRow = (rows: Row[], id: string) => rows.find((r) => r.type === 'content_block' && r.custom_id === id);
/** The translation an item holds itself: not a memory match from the same text in another category. */
const own = (row: Row | undefined) => (row && !row.memory_translated ? (row.translation ?? undefined) : undefined);

beforeAll(async () => {
    fx = await startContractFixture();
    w = seeds.take('moved');
    await fx.use(w);
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/translatable-items') && typeof init?.body === 'string') {
            sent.push(...(JSON.parse(init.body).translatable_items as Array<Record<string, unknown>>));
        }
        return realFetch(input, init);
    }) as typeof fetch;
    await LangsysApp.init({
        projectid: w.project(),
        key: w.key('k-writer'),
        UserLocaleStore: createLocaleStore('es-es'),
        baseLocale: 'en',
        apiUrl: fx.baseUrl,
    } as iLangsysInitConfig);
    await until(() => currentlyLoadedLocale.get() === 'es-es');
});
afterAll(async () => {
    globalThis.fetch = realFetch;
    await fx.stop();
});

const sentFor = (match: (i: Record<string, unknown>) => boolean) => sent.filter(match);
const phraseItem = (phrase: string) => (i: Record<string, unknown>) => i.phrase === phrase;
const blockItem = (i: Record<string, unknown>) => i.type === 'content_block' && i.custom_id === BLOCK_ID;

describe('content moved from Header to Checkout, through each React surface', () => {
    it('MOVE-4 and MOVE-1: renders the previous category’s translation, and registers under the new one with it, as the API reads it', async () => {
        expect(await served('Checkout')).toEqual([]);
        const view = await mount(page());
        try {
            expect(view.text('phrase')).toBe('Comprá ya');
            expect(view.text('call')).toBe('Ingresá');
            expect(view.text('block')).toBe('Bloque movidoSegundo párrafo');
            expect(view.text('control')).toBe('Not moved');

            await until(async () => {
                const checkout = await served('Checkout');
                return ['Buy now', 'Sign in', 'Not moved'].every((p) => phraseRow(checkout, p)) && blockRow(checkout, BLOCK_ID) !== undefined;
            });
            const checkout = await served('Checkout');
            expect(own(phraseRow(checkout, 'Buy now'))).toBe('Comprá ya');
            expect(own(phraseRow(checkout, 'Sign in'))).toBe('Ingresá');
            const block = blockRow(checkout, BLOCK_ID)!;
            expect(Object.fromEntries((block.translations ?? []).map((p) => [p.phrase, own(p)]))).toEqual({
                'Moved block': 'Bloque movido',
                'Second paragraph': 'Segundo párrafo',
            });
            // The control: the same API, given no previous category, copies nothing.
            expect(own(phraseRow(checkout, 'Not moved'))).toBeUndefined();

            // At the transport seam: each moved item went out once, under Checkout, naming Header.
            for (const match of [phraseItem('Buy now'), phraseItem('Sign in'), blockItem]) {
                expect(sentFor(match)).toHaveLength(1);
                expect(sentFor(match)[0]).toMatchObject({ category: 'Checkout', previous_category: 'Header' });
            }
            expect(sentFor(phraseItem('Not moved'))[0]).not.toHaveProperty('previous_category');
        } finally {
            await view.unmount();
        }
    });

    it('MOVE-3: once the refreshed catalog holds the moved items, a later render sends nothing', async () => {
        await LangsysApp.refresh();
        await until(() => ((sTranslations.get() as Record<string, Record<string, unknown>>).Checkout ?? {})['Buy now'] === 'Comprá ya');
        const before = sent.length;
        const view = await mount(page());
        try {
            expect(view.text('phrase')).toBe('Comprá ya');
            expect(view.text('call')).toBe('Ingresá');
            expect(view.text('block')).toBe('Bloque movidoSegundo párrafo');
            await sleep(3000);
            expect(sent.slice(before)).toEqual([]);
        } finally {
            await view.unmount();
        }
    });
});
