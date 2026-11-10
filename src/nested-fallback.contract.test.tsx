// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * SRV-5: a block is registered once, however blocks nest, and never keyed on a placeholder.
 *
 * A `<Translate>` whose children hold a component falls back to the core's DOM class, and that
 * class's walk takes over a marked host nested inside it that nothing claims (MARK-2). A
 * tree-rendered `<Translate>` or `<Phrase>` under such an ancestor registers itself through
 * `registerBlock` with its host, which claims the host, so the walk leaves it alone: the block is
 * sent once, under its own params.
 *
 * Run against the API on an SDK test clone (spec CONF-2). That each block is sent once is a clause
 * about what the SDK sends, which the API cannot show, since it stores a duplicate once: it is
 * measured at the transport seam, every item the SDK posts. What the API accepted is read back
 * from its catalog and a block's stored content: each block under its own id and phrases, the
 * placeholders it was sent and never a value.
 */
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, createElement as el, lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangsysApp, Phrase, Translate, createLocaleStore } from './index.js';
import { anyBlock, startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';
import { everyText } from './test-helpers/contract-held.js';
import seeds from './test-helpers/contract-seeds/nested-fallback.js';
import type { World } from './test-helpers/contract-worlds.js';

let fx: ContractFixture;
let w: World;

/** What the API serves the project's key: everything it accepted. */
const held_ = () => fx.held(w.key('k-writer'), w.project(), 'es-es');

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
    w = seeds.take('base');
    await fx.use(w);
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
        projectid: w.project(),
        key: w.key('k-writer'),
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
    // Mounted straight after init(), so each tree-rendered block registers on every `t` change of
    // the page load (the catalog, then its locale), and the core sends one request per block.
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
        expect({
            outer: blocksWith('Outer text').length,
            middle: blocksWith('Middle one').length,
            inner: blocksWith('Inner one').length,
        }).toEqual({ outer: 1, middle: 1, inner: 1 });
        // The API accepted each block under its own id, with its own phrases: nothing is keyed on
        // another block's, and the outer one holds only its own text.
        const ids = (phrase: string) => blocksWith(phrase).map((b) => String(b.custom_id));
        await until(async () => {
            const held = await held_();
            return ['Outer text', 'Middle one', 'Inner one'].every((p) => Object.values(held.blocks).some((blocks) => Object.entries(blocks).some(([id, ps]) => ids(p).includes(id) && ps.includes(p))));
        });
        const held = await held_();
        const phrasesOf = (id: string) => Object.values(held.blocks).flatMap((blocks) => blocks[id] ?? []);
        expect(phrasesOf(ids('Outer text')[0])).toContain('Outer text');
        expect(phrasesOf(ids('Outer text')[0]).filter((p) => /^(Middle|Inner)/.test(p))).toEqual([]);
        expect(phrasesOf(ids('Middle one')[0])).toEqual(['Middle one', 'Middle two']);
        expect(phrasesOf(ids('Inner one')[0])).toEqual(['Inner one', 'Inner two']);
        await done();
    });

    it('a <Translate> and a <Phrase> nested in a fallback block keep their own params', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () =>
            root.render(
                el(Translate, { category: 'UI' },
                    el('p', null, 'Gallery'),
                    el(Badge),
                    el(Translate, { category: 'UI', params: { name: 'Ana' } },
                        el('img', { alt: 'Photo of %name%' }),
                        el('p', null, 'Taken by %name%'),
                        el('p', null, 'In Lisbon'),
                    ),
                    el(Phrase, { category: 'UI', params: { name: 'Ana' } }, 'Shared by ', el('b', null, '%name%')),
                ),
            ),
        );
        await until(() => blocksWith('Taken by {name}').length > 0 && blocksWith('Gallery').length > 0);
        await sleep(1500);
        // Each nested unit is sent once, as its own placeholders, never with the value in it.
        expect(blocksWith('Taken by {name}').map((b) => (b.phrases as Array<{ phrase: string }>).map((p) => p.phrase))).toEqual([
            ['Photo of {name}', 'Taken by {name}', 'In Lisbon'],
        ]);
        expect(sent.filter((i) => i.type === 'phrase' && String(i.phrase).startsWith('Shared by')).map((i) => i.phrase)).toEqual([
            'Shared by {m0o}{name}{m0c}',
        ]);
        // Nor does anything sent carry the value: not a phrase, and not the enclosing block's content,
        // which keeps a nested host's element and drops its children.
        expect(sent.filter((i) => JSON.stringify(i).includes('Ana'))).toEqual([]);
        // And they still show their own values after the enclosing walk.
        // What the API holds for them: the placeholders, and no value anywhere in it.
        await until(async () => everyText(await held_()).includes('Shared by {m0o}{name}{m0c}'));
        const held = await held_();
        expect(everyText(held)).toEqual(expect.arrayContaining(['Photo of {name}', 'Taken by {name}', 'In Lisbon', 'Shared by {m0o}{name}{m0c}']));
        const stored = await fx.storedBlocks(w, w.key('k-writer'), 'es-es');
        expect(JSON.stringify([held, stored])).not.toContain('Ana');
        expect(host.querySelector('img')?.getAttribute('alt')).toBe('Photo of Ana');
        expect(host.textContent).toContain('Taken by Ana');
        expect(host.textContent).toContain('Shared by Ana');
        await act(async () => root.unmount());
        host.remove();
    });
});

/** Whether a block of the catalog holds `phrase`. */
const anyBlockPhrase = (held: Awaited<ReturnType<typeof held_>>, phrase: string) =>
    Object.values(held.blocks).some((blocks) => Object.values(blocks).some((phrases) => phrases.includes(phrase)));

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
    return {
        tree,
        resolve: (text: string) => act(async () => resolve(text)),
        // Outside act(), React commits on its own schedule, as in a browser: a fallback it has
        // shown stays on screen for at least its throttle (300 ms in React 19).
        resolveOnReactsSchedule: (text: string) => resolve(text),
    };
}

describe('a Suspense placeholder on screen at mount (SRV-5)', () => {
    // The core's DOM class treats what it shows at mount as provisional and keys and registers the
    // block only once its structure has been quiet for the settle window (250 ms).

    // React holds a fallback it has shown for at least 300 ms, so the content arrives about 300 ms
    // after mount; the core's 500 ms window is still open then. Resolved outside act(), so React
    // commits on its browser schedule.
    it('resolved inside the settle window: only the resolved content registers, and nothing is reported', async () => {
        const s = suspended('Intro A', 'Loading A');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        const shown = (text: string) => Array.from(host.querySelectorAll('p')).some((p) => p.textContent === text);
        root.render(s.tree);
        await until(() => shown('Loading A'));
        await sleep(50);
        s.resolveOnReactsSchedule('Real A');
        await until(() => shown('Real A'));
        const done = async () => {
            root.unmount();
            host.remove();
        };
        await until(() => blocksWith('Real A').length > 0);
        await sleep(1000);
        expect(blocksWith('Loading A')).toHaveLength(0);
        expect(blocksWith('Real A')).toHaveLength(1);
        // The API holds the resolved content, the control, and not the placeholder.
        expect(anyBlockPhrase(await held_(), 'Real A')).toBe(true);
        expect(anyBlockPhrase(await held_(), 'Loading A')).toBe(false);
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
        // The placeholder block is the one the API holds, registered once, under its own id.
        await until(async () => anyBlockPhrase(await held_(), 'Loading B'));
        expect(anyBlock(await held_())).toContain(String(blocksWith('Loading B')[0].custom_id));
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
        // The API holds both: the placeholder stays registered, and the resolved content under its own id.
        await until(async () => anyBlock(await held_()).includes(after));
        expect(anyBlock(await held_())).toEqual(expect.arrayContaining([before, after]));
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
