import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerBlock } from 'langsys-js-typescript';
import { LangsysApp, LangsysProvider, Phrase, Translate, createLocaleStore } from './index.js';
import { createRequestScope, renderInRequestScope } from './server.js';
import { catalog } from './test-helpers/ssr-scope.js';

/**
 * On a server, the core's `registerBlock` registers only inside a request scope: outside one it
 * registers nothing and says so in one debug notice. This binding registers a server render's
 * blocks only inside the request's scope, so a render outside every scope — a server that leaves
 * initialisation to the client, a Next client component under `<LangsysProvider>` — never calls
 * it, and the notice never appears. The last case calls `registerBlock` outside a scope itself:
 * the notice it prints shows the earlier cases would have seen one. In that order, since the
 * notice is said once per process.
 */

const NOTICE = 'registerBlock() was called on a server outside a request scope';
const CATALOG = catalog({ UI: {} });
const logged: string[] = [];
const notices = () => logged.filter((line) => line.includes(NOTICE));

function Blocks() {
    return createElement(
        'div',
        null,
        createElement(Translate, { category: 'UI' }, createElement('p', null, 'Hello'), createElement('p', null, 'World')),
        createElement(Phrase, { category: 'UI' }, 'Hello ', createElement('b', null, 'world')),
    );
}

beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(' ')));
    // Debug on, so the core prints its notices. A server render needs no credentials.
    await LangsysApp.init({ projectid: 'p1', key: '', UserLocaleStore: createLocaleStore('en'), debug: true });
});
afterAll(() => vi.restoreAllMocks());

describe('server renders register only inside the request scope', () => {
    it('a render outside every scope registers nothing', () => {
        expect(renderToString(createElement(Blocks))).toContain('World');
        expect(notices()).toEqual([]);
    });

    it('a render under <LangsysProvider seed> registers nothing either', async () => {
        const scope = await createRequestScope({ locale: 'it', catalog: CATALOG });
        const html = renderToString(createElement(LangsysProvider, { seed: scope.seed() }, createElement(Blocks)));
        expect(html).toContain('World');
        expect(notices()).toEqual([]);
    });

    it("a render inside the request's scope registers into it", async () => {
        const { result, seed } = await renderInRequestScope({ locale: 'it', catalog: CATALOG }, () =>
            renderToString(createElement(Blocks)),
        );
        expect(result).toContain('World');
        expect(Object.keys(seed.blocks).length).toBeGreaterThan(0);
        expect(notices()).toEqual([]);
    });

    it('control: registerBlock outside a scope prints the notice', async () => {
        await registerBlock([{ tag: 'p', children: [{ text: 'Hello' }] }], { category: 'UI' });
        expect(notices()).toHaveLength(1);
    });
});
