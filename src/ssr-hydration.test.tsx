// @vitest-environment jsdom
/**
 * SRV-4, the binding's half: the client seeded with a request scope's seed before hydrating
 * renders exactly the server's HTML. The control hydrates the same HTML with another locale's
 * catalog and records the mismatch, which shows the check can see one.
 */
import { act, createElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LangsysApp, useT } from './index.js';
import { renderInRequestScope } from './server.js';
import { catalog } from './test-helpers/ssr-scope.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IT = catalog({ UI: { Pricing: 'Prezzi' } });
const DE = catalog({ UI: { Pricing: 'Preise' } });

function Price() {
    return createElement('p', null, useT()('Pricing', 'UI'));
}

async function hydrate(html: string, seed: { locale: string; catalog: typeof IT }): Promise<unknown[]> {
    LangsysApp.seedCatalog(seed.catalog, seed.locale);
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const errors: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
        root = hydrateRoot(container, createElement(Price), { onRecoverableError: (e) => errors.push(e) });
    });
    await act(async () => root.unmount());
    container.remove();
    return errors;
}

describe('hydrating from a request scope\'s seed', () => {
    it('seeded with the scope\'s seed before hydrating, the client matches the server HTML', async () => {
        // Another visitor's catalog is current in the process while this request renders.
        LangsysApp.seedCatalog(DE, 'de');
        const { result: html, seed, close } = await renderInRequestScope({ locale: 'it', catalog: IT }, () =>
            renderToString(createElement(Price)),
        );
        await close();
        expect(html).toBe('<p>Prezzi</p>');
        expect(seed.locale).toBe('it');
        expect(await hydrate(html, seed)).toEqual([]);
    });

    it('control: the same HTML hydrated with another locale\'s catalog mismatches', async () => {
        const { result: html, close } = await renderInRequestScope({ locale: 'it', catalog: IT }, () =>
            renderToString(createElement(Price)),
        );
        await close();
        expect((await hydrate(html, { locale: 'de', catalog: DE })).length).toBeGreaterThan(0);
    });
});
