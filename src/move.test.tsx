/**
 * MOVE-1..MOVE-5 through this binding: content moved to another category names the one it was
 * registered under before, so its translations follow it. The behaviour is the core's; what is
 * tested here is that every React surface that takes a category hands `previousCategory` to it —
 * `t()` through `inCategory()`, and `<Translate>` / `<Phrase>` as a prop — and that the host
 * React renders carries the markers the core returns.
 *
 * Measured on a server render inside a request scope: a phrase's miss is queued in the scope for
 * `close()` to send, and a block travels in the seed, from which the client registers it.
 */
import { createElement as el } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { iCategories } from 'langsys-js-typescript';
import { LangsysApp, Phrase, Translate, createLocaleStore, inCategory, useT } from './index.js';
import { createRequestScope } from './server.js';

type Item = Record<string, unknown>;

function Call({ category }: { category: string | ReturnType<typeof inCategory> }) {
    const t = useT();
    return el('p', null, t('Moved call', category));
}

/** Server-render `node` in a fresh scope; the phrases and blocks it queued for registration. */
async function inScope(node: () => ReturnType<typeof el>, catalog: iCategories = {} as iCategories, locale = 'en') {
    const scope = await createRequestScope({ locale, catalog });
    let html = '';
    scope.run(() => (html = renderToString(node())));
    // A block a server rendered travels in the seed, and the client registers it from there.
    const blocks = Object.values(scope.seed().blocks) as unknown as Item[];
    const phrases = scope.misses() as unknown as Item[];
    return { html: html.replace(/<!--[^]*?-->/g, ''), blocks, phrases };
}

const block = (category: string, previousCategory?: string | null) =>
    el(Translate, { category, previousCategory }, el('p', null, 'Moved block'), el('p', null, 'Second paragraph'));

beforeAll(async () => {
    await LangsysApp.init({ projectid: 'p1', key: '', UserLocaleStore: createLocaleStore('en'), baseLocale: 'en' });
});

describe('content moved to another category (MOVE-1, MOVE-2)', () => {
    it('a moved block registers with its previous category, under the id it has without one', async () => {
        const moved = (await inScope(() => block('Checkout', 'Header'))).blocks;
        const plain = (await inScope(() => block('Checkout'))).blocks;
        expect(moved).toHaveLength(1);
        expect(moved[0]).toMatchObject({ category: 'Checkout', previousCategory: 'Header' });
        // Control: the same block with no move sends none, and has the same id (MOVE-2).
        expect(plain).toHaveLength(1);
        expect(plain[0].previousCategory).toBeUndefined();
        expect(moved[0].customId).toBe(plain[0].customId);
    });

    it("'' is a value, null is no move, and a previous category equal to the category is none", async () => {
        expect((await inScope(() => block('Checkout', ''))).blocks[0]).toMatchObject({ previousCategory: '' });
        expect((await inScope(() => block('Checkout', null))).blocks[0].previousCategory).toBeUndefined();
        expect((await inScope(() => block('Checkout', 'Checkout'))).blocks[0].previousCategory).toBeUndefined();
    });

    it('a moved <Phrase> and a t() call with inCategory() register with their previous category', async () => {
        const { phrases } = await inScope(() =>
            el(
                'div',
                null,
                el(Phrase, { category: 'Checkout', previousCategory: 'Header' }, 'Moved ', el('b', null, 'phrase')),
                el(Call, { category: inCategory('Checkout', { previousCategory: 'Header' }) }),
            ),
        );
        const of = (text: string) => phrases.find((p) => String(p.phrase).startsWith(text));
        expect(of('Moved call')).toMatchObject({ category: 'Checkout', previousCategory: 'Header' });
        expect(of('Moved ')).toMatchObject({ category: 'Checkout', previousCategory: 'Header' });
        // Control: a plain category string names no move.
        const plain = (await inScope(() => el(Call, { category: 'Checkout' }))).phrases;
        expect(plain).toHaveLength(1);
        expect(plain[0].previousCategory).toBeUndefined();
    });
});

describe('rendering from the previous category (MOVE-4, MOVE-5)', () => {
    it("a moved block renders its previous category's entry, and its host names that id", async () => {
        const oldId = (await inScope(() => block('Header'))).blocks[0].customId as string;
        const catalog = { Header: { [oldId]: { 'Moved block': 'Bloque movido', 'Second paragraph': 'Segundo párrafo' } } } as unknown as iCategories;
        const { html } = await inScope(() => block('Checkout', 'Header'), catalog, 'es-cr');
        expect(html).toContain('Bloque movido');
        expect(html).toContain(`data-ls-previous-contentblock="${oldId}"`);
        // Control: the same block without the move renders its source and names nothing.
        const control = (await inScope(() => block('Checkout'), catalog, 'es-cr')).html;
        expect(control).toContain('Moved block');
        expect(control).not.toContain('data-ls-previous');
    });

    it("a moved <Phrase> and t() call render the previous category's phrase; the phrase host says so", async () => {
        const catalog = {
            Header: { 'Moved call': 'Llamada movida', 'Moved {m0o}phrase{m0c}': 'Frase {m0o}movida{m0c}' },
        } as unknown as iCategories;
        const render = () =>
            el(
                'div',
                null,
                el(Phrase, { category: 'Checkout', previousCategory: 'Header' }, 'Moved ', el('b', null, 'phrase')),
                el(Call, { category: inCategory('Checkout', { previousCategory: 'Header' }) }),
            );
        const { html } = await inScope(render, catalog, 'es-cr');
        expect(html).toContain('<p>Llamada movida</p>');
        expect(html).toMatch(/<span[^>]*data-ls-previous-category="Header"[^>]*>Frase <b>movida<\/b><\/span>/);
        // Once the current category has it, that renders, and the host names no previous category.
        const current = {
            ...catalog,
            Checkout: { 'Moved call': 'Llamada nueva', 'Moved {m0o}phrase{m0c}': 'Frase {m0o}nueva{m0c}' },
        } as unknown as iCategories;
        const after = (await inScope(render, current, 'es-cr')).html;
        expect(after).toContain('<p>Llamada nueva</p>');
        expect(after).toMatch(/<span(?![^>]*data-ls-previous)[^>]*>Frase <b>nueva<\/b><\/span>/);
    });
});
