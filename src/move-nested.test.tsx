/**
 * MOVE-4 for units nested in a block: a `<Phrase>` or `<Translate>` that names no category takes the
 * enclosing block's category and previous category, since it moved with the block; one that names its
 * own category (`''` included) takes neither, and moves only if it names its own previous category.
 *
 * A block that holds a component renders through the core's DOM class, so a unit inside it is a
 * component of its own that registers and renders itself. Measured here on a server render inside a
 * request scope (the unit's registration is queued in the scope: a block travels in the seed, a
 * phrase is a miss); the client paths are in `move-nested-client.test.tsx`.
 */
import { createElement as el, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { iCategories } from 'langsys-js-typescript';
import { LangsysApp, Phrase, Translate, createLocaleStore } from './index.js';
import { createRequestScope } from './server.js';
import { catalog } from './test-helpers/ssr-scope.js';

type Item = Record<string, unknown>;

/** A component child: its DOM is unknown until React renders it, so the block around it falls back. */
const Name = () => el('b', null, 'Ana');

async function inScope(node: () => ReactNode, source: iCategories = {} as iCategories, locale = 'en') {
    const scope = await createRequestScope({ locale, catalog: source });
    let html = '';
    scope.run(() => (html = renderToString(node() as never)));
    return {
        html: html.replace(/<!--[^]*?-->/g, ''),
        blocks: Object.values(scope.seed().blocks) as unknown as Item[],
        phrases: scope.misses() as unknown as Item[],
    };
}

/** The outer block: a Checkout block moved from Header (or whatever `outer` says), holding `inner`. */
const outerBlock = (inner: ReactNode, outer: { category?: string; previousCategory?: string | null } = { category: 'Checkout', previousCategory: 'Header' }) =>
    el(Translate, outer, el(Name), inner);

const phrase = (props: Record<string, unknown> = {}) => el(Phrase, props, 'Inner ', el('i', null, 'phrase'));
const block = (props: Record<string, unknown> = {}) => el(Translate, props, el('p', null, 'Inner block'), el('p', null, 'Second paragraph'));

const innerPhrase = (r: Awaited<ReturnType<typeof inScope>>) => r.phrases.find((p) => String(p.phrase).startsWith('Inner '));
const innerBlock = (r: Awaited<ReturnType<typeof inScope>>) => r.blocks.find((b) => JSON.stringify(b).includes('Inner block'));

beforeAll(async () => {
    await LangsysApp.init({ projectid: 'p1', key: '', UserLocaleStore: createLocaleStore('en'), baseLocale: 'en' });
});

describe('a nested unit that names no category moves with its block (MOVE-4)', () => {
    it('a <Phrase> and a <Translate> take the block’s category and previous category', async () => {
        const r = await inScope(() => outerBlock(el('div', null, phrase(), block())));
        expect(innerPhrase(r)).toMatchObject({ category: 'Checkout', previousCategory: 'Header' });
        expect(innerBlock(r)).toMatchObject({ category: 'Checkout', previousCategory: 'Header' });
    });

    it('through a component between them, and through a nested block that itself names none', async () => {
        const Through = ({ children }: { children?: ReactNode }) => el('section', null, children);
        const r = await inScope(() => outerBlock(el(Through, null, el(Translate, null, el(Name), phrase()))));
        expect(innerPhrase(r)).toMatchObject({ category: 'Checkout', previousCategory: 'Header' });
    });

    it('a previous category of `\'\'` (no category before) is inherited as a value', async () => {
        const r = await inScope(() => outerBlock(phrase(), { category: 'Checkout', previousCategory: '' }));
        expect(innerPhrase(r)).toMatchObject({ category: 'Checkout', previousCategory: '' });
    });

    it('it renders the previous category’s entry, and the host says so (MOVE-5)', async () => {
        const source = catalog({ Header: { 'Inner {m0o}phrase{m0c}': 'Interna {m0o}frase{m0c}' } });
        const { html } = await inScope(() => outerBlock(phrase()), source, 'es-cr');
        expect(html).toMatch(/<span[^>]*data-ls-previous-category="Header"[^>]*>Interna <i>frase<\/i><\/span>/);
        // Control: a unit outside the block has no category to fall back from, so it renders source.
        const outside = (await inScope(() => phrase(), source, 'es-cr')).html;
        expect(outside).toContain('Inner <i>phrase</i>');
        expect(outside).not.toContain('data-ls-previous');
    });
});

describe('a nested unit that names its own category takes neither (MOVE-4)', () => {
    it('takes no previous category from the block, and none for the unmoved case', async () => {
        const r = await inScope(() => outerBlock(el('div', null, phrase({ category: 'Cart' }), block({ category: 'Cart' }))));
        expect(innerPhrase(r)).toMatchObject({ category: 'Cart' });
        expect(innerPhrase(r)?.previousCategory).toBeUndefined();
        expect(innerBlock(r)).toMatchObject({ category: 'Cart' });
        expect(innerBlock(r)?.previousCategory).toBeUndefined();
    });

    it('an explicit category="" names no category: neither the block’s category nor its previous one', async () => {
        const r = await inScope(() => outerBlock(el('div', null, phrase({ category: '' }), block({ category: '' }))));
        expect(innerPhrase(r)).toMatchObject({ category: '' });
        expect(innerPhrase(r)?.previousCategory).toBeUndefined();
        expect(innerBlock(r)).toMatchObject({ category: '' });
        expect(innerBlock(r)?.previousCategory).toBeUndefined();
    });

    it('moves only with its own previousCategory', async () => {
        const r = await inScope(() => outerBlock(el('div', null, phrase({ category: 'Cart', previousCategory: 'Basket' }), block({ category: 'Cart', previousCategory: 'Basket' }))));
        expect(innerPhrase(r)).toMatchObject({ category: 'Cart', previousCategory: 'Basket' });
        expect(innerBlock(r)).toMatchObject({ category: 'Cart', previousCategory: 'Basket' });
    });
});

describe('a nested unit with only a previousCategory of its own, and the controls', () => {
    it('takes the block’s category and its own previous category', async () => {
        const r = await inScope(() => outerBlock(phrase({ previousCategory: 'Basket' })));
        expect(innerPhrase(r)).toMatchObject({ category: 'Checkout', previousCategory: 'Basket' });
    });

    it('a block that names a category and no move: the unit takes the category, and no previous one', async () => {
        const r = await inScope(() => outerBlock(phrase(), { category: 'Checkout' }));
        expect(innerPhrase(r)).toMatchObject({ category: 'Checkout' });
        expect(innerPhrase(r)?.previousCategory).toBeUndefined();
    });

    it('a unit outside any block, naming none, has no category and no move', async () => {
        const r = await inScope(() => phrase());
        expect(innerPhrase(r)).toMatchObject({ category: '' });
        expect(innerPhrase(r)?.previousCategory).toBeUndefined();
    });
});
