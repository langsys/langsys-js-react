// @vitest-environment jsdom
/**
 * `<Translate>` and `<Phrase>` rendered through the core's tree path (`renderBlock`).
 *
 * - A translation that reorders a phrase's inline markup moves the original React elements with
 *   it: each link keeps its own handler, on the client and through a server render and
 *   hydration with no mismatch.
 * - A block that holds a component cannot be rendered without a DOM (SRV-1's sanctioned exception):
 *   on a server it is served as its source with its explicit id, and the core notices it once.
 */
import { act, createElement as el } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from 'langsys-js-typescript';
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

        LangsysApp.seedCatalog(seed.catalog, seed.locale, seed);
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

describe('the seed a scope hands the client (SRV-4)', () => {
    it('carries each block it served, under the id stamped in the HTML', async () => {
        const IT = catalog({ UI: { 'Hello world': 'Ciao mondo' } });
        const { result: html, seed, close } = await renderInRequestScope({ locale: 'it', catalog: IT }, () =>
            renderToString(el(Translate, { category: 'UI' }, el('p', null, 'Hello world'), el('p', null, 'Second line'))),
        );
        await close();
        const id = /data-ls-contentblock="([^"]+)"/.exec(html)?.[1];
        expect(id).toBeTruthy();
        expect(seed.blocks[id!]).toMatchObject({ customId: id, category: 'UI', shape: 'block' });
    });
});

describe('a block the tree path cannot render', () => {
    function Badge() {
        return el('b', null, 'New');
    }

    it('on a server: source served, explicit id stamped, no resolved marker, and the core notices it once', async () => {
        // The notice is the core's, at debug level.
        const debugWas = logger.debugEnabled;
        logger.debugEnabled = true;
        const notice = vi.spyOn(console, 'log').mockImplementation(() => {});
        const tree = el(Translate, { category: 'UI', custom_id: 'promo' }, el('p', null, 'Hello world'), el(Badge));
        const { result: html, close } = await renderInRequestScope({ locale: 'es-es', catalog: ES }, async () => {
            // A block the binding declines to capture takes SRV-1's fallback and throws nothing (SRV-5).
            expect(() => renderToString(tree)).not.toThrow();
            const first = renderToString(tree);
            return first;
        });
        await close();
        expect(html).toBe('<translate data-ls-contentblock="promo"><p>Hello world</p><b>New</b></translate>');
        expect(html).not.toContain('data-ls-resolved');
        logger.debugEnabled = debugWas;
        const messages = notice.mock.calls.map((c) => c.join(' ')).filter((m) => m.includes('was served as source'));
        expect(messages).toHaveLength(1);
    });
});
