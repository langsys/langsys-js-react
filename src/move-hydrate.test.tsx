// @vitest-environment jsdom
/**
 * MOVE-5 on the client: a host React rendered from the previous category carries the marker the
 * core returns, hydrates over the server's HTML without a mismatch, and drops the marker on the
 * render after the catalog gains the current category, since React owns the host's attributes.
 */
import { act, createElement as el } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { currentlyLoadedLocale, sTranslations, type iCategories } from 'langsys-js-typescript';
import { Phrase, Translate } from './index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tree = () =>
    el(
        'div',
        null,
        el(Translate, { category: 'Checkout', previousCategory: 'Header' }, el('p', null, 'Moved block'), el('p', null, 'Second paragraph')),
        el(Phrase, { category: 'Checkout', previousCategory: 'Header' }, 'Moved ', el('b', null, 'phrase')),
    );

function seed(catalog: unknown, locale = 'es-cr') {
    sTranslations.set(catalog as iCategories);
    currentlyLoadedLocale.set(locale);
}

describe('a host rendered from the previous category on the client (MOVE-5)', () => {
    it('hydrates with the marker, and loses it once the current category is in the catalog', async () => {
        // The block's id under its previous category, as a render there derives it.
        seed({});
        const oldId = /data-ls-contentblock="([^"]+)"/.exec(
            renderToString(el(Translate, { category: 'Header' }, el('p', null, 'Moved block'), el('p', null, 'Second paragraph'))),
        )![1];
        const header = {
            Header: {
                [oldId]: { 'Moved block': 'Bloque movido', 'Second paragraph': 'Segundo párrafo' },
                'Moved {m0o}phrase{m0c}': 'Frase {m0o}movida{m0c}',
            },
        };
        seed(header);
        const html = renderToString(tree());
        expect(html).toContain(`data-ls-previous-contentblock="${oldId}"`);
        expect(html).toContain('data-ls-previous-category="Header"');

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const recoverable: unknown[] = [];
        let root!: ReturnType<typeof hydrateRoot>;
        await act(async () => {
            root = hydrateRoot(container, tree(), { onRecoverableError: (e) => recoverable.push(e) });
        });
        expect(recoverable).toEqual([]);
        expect(container.textContent).toContain('Bloque movido');
        expect(container.textContent).toContain('Frase movida');
        expect(container.querySelector('[data-ls-previous-contentblock]')).not.toBeNull();
        expect(container.querySelector('[data-ls-previous-category]')).not.toBeNull();

        // The catalog gains the current category: that renders, and neither marker stays.
        const newId = container.querySelector('translate')!.getAttribute('data-ls-contentblock')!;
        await act(async () =>
            seed({
                ...header,
                Checkout: {
                    [newId]: { 'Moved block': 'Bloque nuevo', 'Second paragraph': 'Párrafo nuevo' },
                    'Moved {m0o}phrase{m0c}': 'Frase {m0o}nueva{m0c}',
                },
            }),
        );
        expect(container.textContent).toContain('Bloque nuevo');
        expect(container.textContent).toContain('Frase nueva');
        expect(container.querySelector('[data-ls-previous-contentblock]')).toBeNull();
        expect(container.querySelector('[data-ls-previous-category]')).toBeNull();
        await act(async () => root.unmount());
        container.remove();
    });
});
