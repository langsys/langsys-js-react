// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * A block is registered once, however blocks nest (spec SRV-5's "capture each child once").
 *
 * A `<Translate>` whose children hold a component falls back to the core's DOM class, and that
 * class's walk registers the stamped block hosts nested inside it (MARK-4). A tree-rendered
 * `<Translate>` under such an ancestor therefore leaves its registration to the ancestor's walk;
 * registering it itself would send the same block twice. Measured at the transport seam — every
 * item the SDK posts — because the double's accepted state stores a duplicate once and cannot
 * show it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el, lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangsysApp, Translate, createLocaleStore } from './index.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';

let fx: ContractFixture;
const SEED = {
    projects: [{ id: 'p1', base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local' }],
    keys: [{ key: 'k-writer', project: 'p1', type: 'write' }],
};

type Item = Record<string, unknown>;
const sent: Item[] = [];
const realFetch = globalThis.fetch;

function Badge() {
    return el('span', null, 'New');
}

async function render(tree: ReactNode) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(tree));
    return async () => {
        await act(async () => root.unmount());
        host.remove();
    };
}

beforeAll(async () => {
    fx = await startContractFixture();
    await fx.seed(SEED);
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.endsWith('/translatable-items') && typeof init?.body === 'string') {
            sent.push(...((JSON.parse(init.body).translatable_items ?? []) as Item[]));
        }
        return realFetch(input, init);
    }) as typeof fetch;
    await LangsysApp.init({
        projectid: 'p1',
        key: 'k-writer',
        UserLocaleStore: createLocaleStore('en'),
        baseLocale: 'en',
        apiUrl: fx.baseUrl,
    } as never);
});
afterAll(async () => {
    globalThis.fetch = realFetch;
    await fx.stop();
});

describe('nested blocks register once', () => {
    it('depth 3, with a component in the outer block: each block is sent exactly once', async () => {
        const done = await render(
            el(Translate, { category: 'UI' },
                el('p', null, 'Outer text'),
                el(Badge),
                el(Translate, { category: 'UI' },
                    el('p', null, 'Middle one'),
                    el('p', null, 'Middle two'),
                    el(Translate, { category: 'UI' }, el('p', null, 'Inner one'), el('p', null, 'Inner two')),
                ),
            ),
        );
        // A block is identified by the phrases it registers with; count the block items carrying each.
        const blocksWith = (phrase: string) =>
            sent.filter((i) => i.type === 'content_block' && (i.phrases as Array<{ phrase: string }>).some((p) => p.phrase === phrase));
        await until(() => blocksWith('Inner one').length > 0 && blocksWith('Outer text').length > 0);
        await sleep(1500);
        process.stderr.write('ITEMS ' + JSON.stringify(sent.map((i) => [i.type, i.custom_id, (i.phrases as Array<{ phrase: string }> | undefined)?.map((p) => p.phrase) ?? i.phrase])) + '\n');
        expect({
            outer: blocksWith('Outer text').length,
            middle: blocksWith('Middle one').length,
            inner: blocksWith('Inner one').length,
        }).toEqual({ outer: 1, middle: 1, inner: 1 });
        await done();
    });
});

describe('a Suspense placeholder on screen at mount (SRV-5)', () => {
    // Measured: the fallback block's DOM class walks what is on screen when it mounts, so a lazy
    // child still behind its Suspense fallback keys the block on the placeholder, and the real
    // content never registers. Recorded as it.fails until the guard exists; passing turns it red.
    it.fails('no block is keyed on the placeholder, and the real content registers once it arrives', async () => {
        let resolveLate!: (m: { default: () => ReactNode }) => void;
        const Late = lazy(() => new Promise<{ default: () => ReactNode }>((r) => (resolveLate = r)));
        const done = await render(
            el(Translate, { category: 'UI' },
                el('p', null, 'Intro one'),
                el(Suspense, { fallback: el('p', null, 'Loading spinner') }, el(Late)),
            ),
        );
        await sleep(1500);
        await act(async () => resolveLate({ default: () => el('p', null, 'Real content') }));
        await sleep(1500);
        const phrases = sent.flatMap((i) => ((i.phrases as Array<{ phrase: string }> | undefined) ?? []).map((p) => p.phrase));
        expect(phrases).not.toContain('Loading spinner');
        expect(phrases).toContain('Real content');
        await done();
    });
});
