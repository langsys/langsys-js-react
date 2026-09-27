// @vitest-environment jsdom
/**
 * `<Translate custom_id>` carries its identity from the first render (spec MARK-1), so the
 * server's HTML has it, and hydration keeps it without a mismatch.
 */
import { act, createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Translate } from './index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('<Translate> identity on the server route', () => {
    it('an explicit custom_id is in the server HTML and survives hydration', async () => {
        const tree = createElement(Translate, { custom_id: 'block-42', category: 'UI', children: 'Hello world' });
        const html = renderToString(tree);
        expect(html).toBe('<translate data-ls-contentblock="block-42">Hello world</translate>');

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const recoverable: unknown[] = [];
        let root!: ReturnType<typeof hydrateRoot>;
        await act(async () => {
            root = hydrateRoot(container, tree, { onRecoverableError: (e) => recoverable.push(e) });
        });
        expect(recoverable).toEqual([]);
        expect(container.querySelector('translate')?.getAttribute('data-ls-contentblock')).toBe('block-42');
        await act(async () => root.unmount());
        container.remove();
    });

    it('with no custom_id the server HTML carries the derived id, and hydration keeps it', async () => {
        const tree = createElement(Translate, { category: 'UI', children: 'Hello world' });
        const html = renderToString(tree);
        const id = /data-ls-contentblock="([^"]+)"/.exec(html)?.[1];
        expect(id).toBeTruthy();

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const recoverable: unknown[] = [];
        let root!: ReturnType<typeof hydrateRoot>;
        await act(async () => {
            root = hydrateRoot(container, tree, { onRecoverableError: (e) => recoverable.push(e) });
        });
        expect(recoverable).toEqual([]);
        expect(container.querySelector('translate')?.getAttribute('data-ls-contentblock')).toBe(id);
        await act(async () => root.unmount());
        container.remove();
    });
});
