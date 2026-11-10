// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * SRV-5, the half a server's answer decides: however blocks nest, each is stored under its own id
 * with its own phrases, never keyed on a placeholder, and nothing the API holds carries a value.
 *
 * A `<Translate>` whose children hold a component falls back to the core's DOM class, and that
 * class's walk takes over a marked host nested inside it that nothing claims (MARK-2). A
 * tree-rendered `<Translate>` or `<Phrase>` under such an ancestor registers itself through
 * `registerBlock` with its host, which claims the host, so the walk leaves it alone.
 *
 * Run against the API on an SDK test clone (spec CONF-2). Every assertion reads what the API
 * accepted: the catalog it serves the project's key, and each block's stored content as the
 * project's owner reads it. That each block is *sent* once is a clause about what the SDK sends,
 * which no answer of an API can show (it stores a duplicate once), so it is proven at the
 * transport seam, with no server, in `nested-fallback-sends.test.tsx`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el, lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangsysApp, Phrase, Translate, createLocaleStore } from './index.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';
import { everyText } from './test-helpers/contract-held.js';
import seeds from './test-helpers/contract-seeds/nested-fallback.js';
import type { World } from './test-helpers/contract-worlds.js';

let fx: ContractFixture;
let w: World;

/** What the API serves the project's key: everything it accepted. */
const held = () => fx.held(w.key('k-writer'), w.project(), 'es-es');

/** The blocks the catalog holds that include `phrase`, each as its id and its phrases. */
const blocksWith = async (phrase: string) =>
    Object.values((await held()).blocks).flatMap((blocks) =>
        Object.entries(blocks).filter(([, phrases]) => phrases.includes(phrase))
    );

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
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await LangsysApp.init({
        projectid: w.project(),
        key: w.key('k-writer'),
        UserLocaleStore: createLocaleStore('en'),
        baseLocale: 'en',
        apiUrl: fx.baseUrl,
    } as never);
});
afterAll(async () => {
    await fx.stop();
});

describe('nested blocks are stored under their own ids', () => {
    it('depth 3, with a component in the outer block: each block holds its own phrases and none another block’s', async () => {
        const done = await render(
            el(
                Translate,
                { category: 'UI' },
                el('p', null, 'Outer text'),
                el(Badge),
                el(
                    Translate,
                    { category: 'UI' },
                    el('p', null, 'Middle one'),
                    el('p', null, 'Middle two'),
                    el(Translate, { category: 'UI' }, el('p', null, 'Inner one'), el('p', null, 'Inner two'))
                )
            )
        );
        await until(
            async () =>
                (await blocksWith('Inner one')).length > 0 &&
                (await blocksWith('Middle one')).length > 0 &&
                (await blocksWith('Outer text')).length > 0
        );
        // One block each: a nested block is no copy of its enclosing one.
        const [outer, middle, inner] = await Promise.all(['Outer text', 'Middle one', 'Inner one'].map(blocksWith));
        expect([outer.length, middle.length, inner.length]).toEqual([1, 1, 1]);
        // The catalog lists a block's phrases in sorted order.
        expect(middle[0][1]).toEqual(['Middle one', 'Middle two']);
        expect(inner[0][1]).toEqual(['Inner one', 'Inner two']);
        expect(outer[0][1]).toContain('Outer text');
        expect(outer[0][1].filter((p) => /^(Middle|Inner)/.test(p))).toEqual([]);
        expect(new Set([outer[0][0], middle[0][0], inner[0][0]]).size).toBe(3);
        await done();
    });

    it('a <Translate> and a <Phrase> nested in a fallback block are stored as their own placeholders, never with the value', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () =>
            root.render(
                el(
                    Translate,
                    { category: 'UI' },
                    el('p', null, 'Gallery'),
                    el(Badge),
                    el(
                        Translate,
                        { category: 'UI', params: { name: 'Ana' } },
                        el('img', { alt: 'Photo of %name%' }),
                        el('p', null, 'Taken by %name%'),
                        el('p', null, 'In Lisbon')
                    ),
                    el(Phrase, { category: 'UI', params: { name: 'Ana' } }, 'Shared by ', el('b', null, '%name%'))
                )
            )
        );
        await until(
            async () =>
                everyText(await held()).includes('Shared by {m0o}{name}{m0c}') &&
                (await blocksWith('Gallery')).length > 0 &&
                (await blocksWith('Taken by {name}')).length > 0
        );
        // The nested block is one block of its own phrases, with its attribute a placeholder too.
        expect((await blocksWith('Taken by {name}')).map(([, phrases]) => phrases)).toEqual([
            ['In Lisbon', 'Photo of {name}', 'Taken by {name}'],
        ]);
        // Nothing the API holds carries the value: not a phrase, and not a block's stored content,
        // which keeps a nested host's element and drops its children.
        const stored = await fx.storedBlocks(w, w.key('k-writer'), 'es-es');
        expect(JSON.stringify([await held(), stored])).not.toContain('Ana');
        // And they still show their own values after the enclosing walk.
        expect(host.querySelector('img')?.getAttribute('alt')).toBe('Photo of Ana');
        expect(host.textContent).toContain('Taken by Ana');
        expect(host.textContent).toContain('Shared by Ana');
        await act(async () => root.unmount());
        host.remove();
    });
});

/** A `<Translate>` that falls back to the core's DOM class with a lazy child behind a Suspense placeholder. */
function suspended(intro: string, spinner: string) {
    let resolve!: (text: string) => void;
    const Late = lazy(
        () =>
            new Promise<{ default: () => ReactNode }>(
                (r) => (resolve = (text) => r({ default: () => el('p', null, text) }))
            )
    );
    const tree = el(
        Translate,
        { category: 'UI' },
        el('p', null, intro),
        el(Suspense, { fallback: el('p', null, spinner) }, el(Late))
    );
    return {
        tree,
        resolve: (text: string) => act(async () => resolve(text)),
        // Outside act(), React commits on its own schedule, as in a browser: a fallback it has
        // shown stays on screen for at least its throttle (300 ms in React 19).
        resolveOnReactsSchedule: (text: string) => resolve(text),
    };
}

describe('a Suspense placeholder on screen at mount (SRV-5): what the API holds', () => {
    // The core's DOM class treats what it shows at mount as provisional and keys and registers the
    // block only once its structure has been quiet for the settle window.

    it('resolved inside the settle window: the API holds only the resolved content', async () => {
        const s = suspended('Intro A', 'Loading A');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        const shown = (text: string) => Array.from(host.querySelectorAll('p')).some((p) => p.textContent === text);
        root.render(s.tree);
        await until(() => shown('Loading A'), 8000, 25);
        await sleep(50);
        s.resolveOnReactsSchedule('Real A');
        await until(() => shown('Real A'), 8000, 25);
        // The resolved block is the control: stored, so the wait would have seen the placeholder too.
        await until(async () => (await blocksWith('Real A')).length > 0);
        await sleep(2000);
        expect(await blocksWith('Real A')).toHaveLength(1);
        expect(await blocksWith('Loading A')).toHaveLength(0);
        root.unmount();
        host.remove();
    });

    it('never resolved: the placeholder is stored once, in the block that holds the intro', async () => {
        const s = suspended('Intro B', 'Loading B');
        const done = await render(s.tree);
        await until(async () => (await blocksWith('Loading B')).length > 0);
        await sleep(2000);
        const stored = await blocksWith('Intro B');
        expect(stored).toHaveLength(1);
        expect(stored[0][1]).toEqual(['Intro B', 'Loading B']);
        expect(await blocksWith('Loading B')).toHaveLength(1);
        await done();
    });

    it('resolved after the window: the placeholder stays stored, and the resolved content is stored under an id of its own', async () => {
        const s = suspended('Intro C', 'Loading C');
        const done = await render(s.tree);
        await until(async () => (await blocksWith('Loading C')).length > 0);
        await sleep(400);
        await s.resolve('Real C');
        await until(async () => (await blocksWith('Real C')).length > 0);
        await sleep(2000);
        const [[before, beforePhrases]] = await blocksWith('Loading C');
        const [[after, afterPhrases]] = await blocksWith('Real C');
        expect(before).not.toBe(after);
        expect(beforePhrases).toEqual(['Intro C', 'Loading C']);
        expect(afterPhrases).toEqual(['Intro C', 'Real C']);
        expect(await blocksWith('Loading C')).toHaveLength(1);
        expect(await blocksWith('Real C')).toHaveLength(1);
        await done();
    });
});
