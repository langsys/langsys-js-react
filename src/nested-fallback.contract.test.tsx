// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * SRV-5: a block is registered once, however blocks nest, and never keyed on a placeholder.
 *
 * A `<Translate>` whose children hold a component falls back to the core's DOM class, and that
 * class's walk registers the stamped block hosts nested inside it (MARK-4). A tree-rendered
 * `<Translate>` under such an ancestor therefore leaves its registration to the ancestor's walk;
 * registering it itself would send the same block twice. Measured at the transport seam — every
 * item the SDK posts — because the double's accepted state stores a duplicate once and cannot
 * show it.
 */
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
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
const consoleSpies: MockInstance[] = [];

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
        consoleSpies.push(vi.spyOn(console, m).mockImplementation(() => {}));
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
        debug: true,
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

/** The content blocks sent so far that carry `phrase`. */
const blocksWith = (phrase: string) =>
    sent.filter((i) => i.type === 'content_block' && (i.phrases as Array<{ phrase: string }>).some((p) => p.phrase === phrase));

/** Every debug line the core has logged that mentions `text`. */
const noticesWith = (text: string) =>
    consoleSpies.flatMap((spy) => spy.mock.calls.map((args) => args.map(String).join(' '))).filter((line) => line.includes(text));

/** A `<Translate>` that falls back to the core's DOM class with a lazy child behind a Suspense placeholder. */
function suspended(intro: string, spinner: string) {
    let resolve!: (text: string) => void;
    const Late = lazy(() => new Promise<{ default: () => ReactNode }>((r) => (resolve = (text) => r({ default: () => el('p', null, text) }))));
    const tree = el(Translate, { category: 'UI' },
        el('p', null, intro),
        el(Suspense, { fallback: el('p', null, spinner) }, el(Late)),
    );
    return { tree, resolve: (text: string) => act(async () => resolve(text)) };
}

describe('a Suspense placeholder on screen at mount (SRV-5)', () => {
    // The core's DOM class treats what it shows at mount as provisional and keys and registers the
    // block only once its structure has been quiet for the settle window (250 ms).

    it('resolved inside the settle window: only the resolved content registers, and nothing is reported', async () => {
        const s = suspended('Intro A', 'Loading A');
        const done = await render(s.tree);
        await sleep(50);
        await s.resolve('Real A');
        await until(() => blocksWith('Real A').length > 0);
        await sleep(1000);
        expect(blocksWith('Loading A')).toHaveLength(0);
        expect(blocksWith('Real A')).toHaveLength(1);
        expect(noticesWith(String(blocksWith('Real A')[0].custom_id))).toEqual([]);
        await done();
    });

    it('never resolved: nothing registers inside the window, then the placeholder registers once, unreported', async () => {
        const s = suspended('Intro B', 'Loading B');
        const done = await render(s.tree);
        await sleep(100);
        expect(blocksWith('Intro B')).toHaveLength(0);
        await until(() => blocksWith('Loading B').length > 0);
        await sleep(1000);
        expect(blocksWith('Intro B')).toHaveLength(1);
        expect(blocksWith('Loading B')).toHaveLength(1);
        expect(noticesWith(String(blocksWith('Loading B')[0].custom_id))).toEqual([]);
        await done();
    });

    it('resolved after the window: the placeholder stays registered, the resolved content registers, and the re-key is reported once naming both ids', async () => {
        const s = suspended('Intro C', 'Loading C');
        const done = await render(s.tree);
        await until(() => blocksWith('Loading C').length > 0);
        await sleep(400);
        await s.resolve('Real C');
        await until(() => blocksWith('Real C').length > 0);
        await sleep(1000);
        const before = String(blocksWith('Loading C')[0].custom_id);
        const after = String(blocksWith('Real C')[0].custom_id);
        expect(before).not.toBe(after);
        expect(blocksWith('Loading C')).toHaveLength(1);
        expect(blocksWith('Real C')).toHaveLength(1);
        const notices = noticesWith('changed its structure after it settled');
        expect(notices.filter((n) => n.includes(before))).toHaveLength(1);
        expect(notices.filter((n) => n.includes(before))[0]).toContain(
            `A <Translate> block registered as ${before} changed its structure after it settled and is now ${after}. If ${before} was a placeholder (a Suspense fallback still showing when the settle window closed), it stays registered.`,
        );
        await done();
    });
});
