// @vitest-environment jsdom
/**
 * `<Translate>` and `<Phrase>` rendered through the core's tree path (`renderBlock`).
 *
 * - A translation that reorders a phrase's inline markup moves the original React elements with
 *   it: each link keeps its own handler, on the client and through a server render and
 *   hydration with no mismatch.
 * - A block that holds a component cannot be rendered without a DOM (fleet rule): on a server it
 *   is served as its source with its explicit id, and the core warns once.
 */
import { act, createElement as el } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LangsysApp, Phrase, Translate } from './index.js';
import { renderInRequestScope } from './server.js';
import { catalog } from './test-helpers/ssr-scope.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ES = catalog({
    UI: { 'Read {m0o}terms{m0c} and {m1o}privacy{m1c}': 'Lee la {m1o}privacidad{m1c} y los {m0o}términos{m0c}' },
});

function Consent({ onTerms, onPrivacy }: { onTerms: () => void; onPrivacy: () => void }) {
    return el(
        Phrase,
        { category: 'UI' },
        'Read ',
        el('a', { href: '/terms', onClick: onTerms }, 'terms'),
        ' and ',
        el('a', { href: '/privacy', onClick: onPrivacy }, 'privacy'),
    );
}

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('<Phrase> reordered by its translation', () => {
    it('each link moves with its handler', async () => {
        LangsysApp.seedCatalog(ES, 'es-es');
        const onTerms = vi.fn();
        const onPrivacy = vi.fn();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () => root.render(el(Consent, { onTerms, onPrivacy })));

        expect(host.textContent).toBe('Lee la privacidad y los términos');
        const [first, second] = host.querySelectorAll('a');
        expect(first.getAttribute('href')).toBe('/privacy');
        first.click();
        expect(onPrivacy).toHaveBeenCalledTimes(1);
        expect(onTerms).not.toHaveBeenCalled();
        second.click();
        expect(onTerms).toHaveBeenCalledTimes(1);
        await act(async () => root.unmount());
    });

    it('a server render in a scope hydrates with no mismatch, handlers attached', async () => {
        const onTerms = vi.fn();
        const onPrivacy = vi.fn();
        const tree = el(Consent, { onTerms, onPrivacy });
        const { result: html, seed, close } = await renderInRequestScope({ locale: 'es-es', catalog: ES }, () =>
            renderToString(tree),
        );
        await close();
        expect(html).toContain('privacidad');

        LangsysApp.seedCatalog(seed.catalog, seed.locale);
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const recoverable: unknown[] = [];
        let root!: ReturnType<typeof hydrateRoot>;
        await act(async () => {
            root = hydrateRoot(container, tree, { onRecoverableError: (e) => recoverable.push(e) });
        });
        expect(recoverable).toEqual([]);
        container.querySelector('a')!.click();
        expect(onPrivacy).toHaveBeenCalledTimes(1);
        await act(async () => root.unmount());
    });
});

describe('a block the tree path cannot render', () => {
    function Badge() {
        return el('b', null, 'New');
    }

    it('on a server: source served, explicit id stamped, and the core warns once', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const tree = el(Translate, { category: 'UI', custom_id: 'promo' }, el('p', null, 'Hello world'), el(Badge));
        const { result: html, close } = await renderInRequestScope({ locale: 'es-es', catalog: ES }, async () => {
            const first = renderToString(tree);
            renderToString(tree); // a second render of the same shape does not warn again
            return first;
        });
        await close();
        expect(html).toBe('<translate data-ls-contentblock="promo"><p>Hello world</p><b>New</b></translate>');
        const messages = warn.mock.calls.map((c) => c.join(' ')).filter((m) => m.includes('not rendered on the server'));
        expect(messages).toHaveLength(1);
    });
});
