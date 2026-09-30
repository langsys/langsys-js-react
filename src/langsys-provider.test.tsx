// @vitest-environment jsdom
/**
 * `<LangsysProvider seed>`: a request rendered in its own locale where the framework renders
 * client components apart from the code that opened the request's scope (Next.js's App Router).
 *
 * The seed comes from a real request scope, round-tripped through JSON as it crosses the
 * server/client boundary, and the provider rebuilds the scope with the core's `scopeFromSeed`.
 * Another visitor's catalog (`de`) is current in the process throughout, so a render that read
 * the page's state instead of the request's would show German.
 */
import { act, createElement as el } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRequestScope, type RequestSeed } from 'langsys-js-typescript';
import {
    LangsysApp,
    LangsysProvider,
    Translate,
    currentlyLoadedLocale,
    useCurrentLocale,
    useT,
    useTranslations,
} from './index.js';
import { catalog } from './test-helpers/ssr-scope.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IT = catalog({ UI: { Pricing: 'Prezzi', 'Hello world': 'Ciao mondo' } });
const DE = catalog({ UI: { Pricing: 'Preise', 'Hello world': 'Hallo Welt' } });
let itSeed: RequestSeed;

function Client() {
    const t = useT();
    const cat = useTranslations() as unknown as Record<string, Record<string, string>>;
    return el(
        'div',
        null,
        el('p', null, `${t('Pricing', 'UI')}|${useCurrentLocale()}|${cat.UI?.Pricing}`),
        el(Translate, { category: 'UI' }, 'Hello world'),
    );
}

beforeAll(async () => {
    // The seed as a server component hands it over: JSON, across the server/client boundary.
    const scope = await createRequestScope({ locale: 'it', catalog: IT });
    itSeed = JSON.parse(JSON.stringify(scope.seed())) as RequestSeed;
});

describe('<LangsysProvider seed>', () => {
    it('a server render reads the request\'s scope, not the page\'s state', () => {
        LangsysApp.seedCatalog(DE, 'de');
        const html = renderToString(el(LangsysProvider, { seed: itSeed }, el(Client)));
        expect(html).toContain('<p>Prezzi|it|Prezzi</p>');
        expect(html).toMatch(/<translate data-ls-contentblock="[^"]+" data-ls-resolved="it">Ciao mondo<\/translate>/);
    });

    it('control: without the provider the same render shows the process\'s catalog', () => {
        LangsysApp.seedCatalog(DE, 'de');
        const html = renderToString(el(Client));
        expect(html).toContain('<p>Preise|de|Preise</p>');
    });

    it('the browser hydrates the server HTML with no mismatch, and stays in the request\'s locale', async () => {
        LangsysApp.seedCatalog(DE, 'de');
        const tree = el(LangsysProvider, { seed: itSeed }, el(Client));
        const html = renderToString(tree);

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const recoverable: unknown[] = [];
        let root!: ReturnType<typeof hydrateRoot>;
        await act(async () => {
            root = hydrateRoot(container, tree, { onRecoverableError: (e) => recoverable.push(e) });
        });
        expect(recoverable).toEqual([]);
        // After hydration the hooks read the page's state, which the provider seeded.
        expect(currentlyLoadedLocale.get()).toBe('it');
        expect(container.querySelector('p')!.textContent).toBe('Prezzi|it|Prezzi');
        expect(container.querySelector('translate')!.textContent).toBe('Ciao mondo');
        await act(async () => root.unmount());
        container.remove();
    });
});
