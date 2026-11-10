// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangsysApp, Phrase, Translate, createLocaleStore, useT } from './index.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';
import { everyText } from './test-helpers/contract-held.js';
import seeds from './test-helpers/contract-seeds/gate10.js';
import type { World } from './test-helpers/contract-worlds.js';

/**
 * GATE-10 through this binding's components, against the API on an SDK test clone (tier
 * `contract`, spec CONF-2). Every assertion reads what the API accepted, as the catalog serves it
 * to the project's key, never what the SDK sent.
 *
 * Text inside a `data-ls-resolved` subtree is already translated output, not source, so no
 * miss is recorded for it. The core decides that by walking up from the host element it is
 * given; this binding's part is to hand `<Translate>` and `<Phrase>` hosts that live in the
 * real document, so an ancestor marker set by the app's layout is reachable.
 *
 * The session may write, so the API stores anything the SDK registers. Every absence is
 * asserted only after an unmarked control from the same render has been stored.
 */

let fx: ContractFixture;
let w: World;

/** Every source string the API holds for the project, from phrases and from content blocks. */
async function accepted(): Promise<string[]> {
    return everyText(await fx.held(w.key('k-writer'), w.project(), 'es-es'));
}
const has = async (needle: string) => (await accepted()).some((s) => s.includes(needle));

async function render(tree: ReactNode): Promise<() => Promise<void>> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(tree));
    return async () => {
        await act(async () => root.unmount());
        host.remove();
    };
}

const el = createElement;

beforeAll(async () => {
    fx = await startContractFixture();
    w = seeds.take('base');
    await fx.use(w);
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await LangsysApp.init({
        projectid: w.project(),
        key: w.key('k-writer'),
        UserLocaleStore: createLocaleStore('es-es'),
        baseLocale: 'en',
        apiUrl: fx.baseUrl,
    } as never);
});
afterAll(async () => {
    await fx.stop();
});

describe('GATE-10 — a resolved subtree records no miss, read through this binding', () => {
    it('<Translate> content blocks: marked suppressed, unmarked registered, both spellings, opt-out, inheritance', async () => {
        const block = (word: string) =>
            el(Translate, { category: 'UI' }, el('p', null, `Block ${word} one`), el('p', null, `Block ${word} two`));
        const done = await render(
            el('div', null,
                block('control'),
                el('div', { 'data-ls-resolved': 'es-es' }, block('resolved')),
                el('div', { 'data-langsys-resolved': 'es-es' }, block('legacyspelling')),
                el('div', { 'data-ls-resolved': '' }, block('bare')),
                el('div', { 'data-ls-resolved': 'false' }, block('optout')),
                // Inheritance: the marker sits two levels above the component's host.
                el('section', { 'data-ls-resolved': 'es-es' }, el('div', null, el('article', null, block('inherited')))),
            ),
        );
        await until(() => has('Block control one'));
        await until(() => has('Block optout one'));
        await sleep(2000);
        for (const word of ['resolved', 'legacyspelling', 'bare', 'inherited']) {
            expect(await has(`Block ${word}`), word).toBe(false);
        }
        await done();
    });

    it('<Translate> single-token path: marked suppressed, unmarked registered', async () => {
        const done = await render(
            el('div', null,
                el(Translate, { category: 'UI' }, 'Single control'),
                el('div', { 'data-ls-resolved': 'es-es' }, el(Translate, { category: 'UI' }, 'Single resolved')),
            ),
        );
        await until(() => has('Single control'));
        await sleep(2000);
        expect(await has('Single resolved')).toBe(false);
        await done();
    });

    it('<Phrase>: marked suppressed, unmarked registered', async () => {
        const done = await render(
            el('div', null,
                el(Phrase, { category: 'UI' }, 'Phrase ', el('strong', null, 'control'), ' text'),
                el('div', { 'data-ls-resolved': 'es-es' }, el(Phrase, { category: 'UI' }, 'Phrase ', el('strong', null, 'resolved'), ' text')),
            ),
        );
        // Inline markup is stored as neutral tokens, so the control is `Phrase {m0o}control{m0c} text`.
        await until(async () => (await accepted()).includes('Phrase {m0o}control{m0c} text'));
        await sleep(2000);
        expect(await accepted()).not.toContain('Phrase {m0o}resolved{m0c} text');
        await done();
    });

    // Negative control. A bare t() is not a reader: its argument is source text from the app's
    // code, with no subtree of its own, so it records its miss even when the component calling
    // it renders inside a resolved subtree. (GATE-9 is what governs t(); this project leaves it off.)
    it('useT() under a resolved ancestor still registers, beside a <Translate> there that does not', async () => {
        function BareT() {
            return el('span', null, useT()('Bare t under resolved', 'UI'));
        }
        const done = await render(
            el('div', { 'data-ls-resolved': 'es-es' },
                el(BareT),
                el(Translate, { category: 'UI' }, 'Sibling block under resolved'),
            ),
        );
        await until(async () => (await accepted()).includes('Bare t under resolved'));
        await sleep(2000);
        expect(await has('Sibling block under resolved')).toBe(false);
        await done();
    });
});
