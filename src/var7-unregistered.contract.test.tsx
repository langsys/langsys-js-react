// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * VAR-7: what cannot be recovered is not registered. Without the build transform, a value
 * interpolated in `<Translate>` / `<Phrase>` markup reaches React as a text run split across
 * children; this binding can tell that much but cannot name the value, so the unit registers
 * nothing, while a static unit rendered beside it registers as before. Built with
 * `createElement`, which the build transform does not rewrite. Measured against what the API on an
 * SDK test clone accepted (spec CONF-2), read back from its catalog, for two users each. Every
 * absence is read beside a control the same run registers, which the API holds. The core reports
 * the unit once, as a debug notice.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { logger } from 'langsys-js-typescript';
import { DontTranslate, LangsysApp, Phrase, Translate, createLocaleStore } from './index.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';
import { block, listHeld } from './test-helpers/contract-held.js';
import seeds from './test-helpers/contract-seeds/var7-unregistered.js';
import type { World } from './test-helpers/contract-worlds.js';

let fx: ContractFixture;
let w: World;

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

async function show(node: ReactNode): Promise<string> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(node));
    const text = host.textContent ?? '';
    // Mounted past the core's 500 ms settle window, so a block that falls back to the DOM class
    // registers before it unmounts.
    await sleep(700);
    await act(async () => root.unmount());
    host.remove();
    return text;
}

/** What the API holds for the project: `category:phrase`, and a block as `category:BLOCK[its phrases]`. */
async function stored(): Promise<string[]> {
    return listHeld(await fx.held(w.key('k-writer'), w.project(), 'es-es'));
}

/**
 * The control for an absence: a static unit shown after the ones under test, in a category of its
 * own, which the API holds by the time the wait ends, so the wait would have seen a registration.
 */
async function control(label: string): Promise<void> {
    await show(el(Translate, { category: `C-${label}` }, `Control for ${label}`));
    await until(async () => (await stored()).includes(`C-${label}:Control for ${label}`));
}

describe('values the build transform did not rewrite', () => {
    it('register nothing, while a static unit beside them registers', async () => {
        const texts: string[] = [];
        for (const name of ['Ana', 'Bo']) {
            texts.push(await show(el(Translate, { category: 'A' }, 'Hello ', name)));
            texts.push(await show(el(Translate, { category: 'B' }, el('p', null, 'You have ', name.length, ' items'))));
            texts.push(await show(el(Phrase, { category: 'C' }, 'Hi ', name, ', see ', el('b', null, 'this'))));
        }
        texts.push(await show(el(Translate, { category: 'S' }, 'Static sentence')));
        await until(async () => (await stored()).length > 0);
        await sleep(1500);

        expect(texts).toEqual([
            'Hello Ana', 'You have 3 items', 'Hi Ana, see this',
            'Hello Bo', 'You have 2 items', 'Hi Bo, see this',
            'Static sentence',
        ]);
        expect(await stored()).toEqual(['S:Static sentence']);
    });

    // A phrase keys a subtree that is not translated as one empty pair (TOK-1), so a value split
    // inside <DontTranslate> never enters it: both users register the one phrase, and each page
    // shows its own value.
    it('a value split inside <DontTranslate> in a <Phrase> registers the phrase without it', async () => {
        const texts: string[] = [];
        for (const name of ['Ana', 'Bo']) {
            texts.push(await show(el(Phrase, { category: 'G' }, 'Signed in as ', el(DontTranslate, null, 'user ', name))));
        }
        await until(async () => (await stored()).some((s) => s.startsWith('G:')));
        await sleep(1000);
        expect(texts).toEqual(['Signed in as user Ana', 'Signed in as user Bo']);
        expect((await stored()).filter((s) => s.startsWith('G:'))).toEqual(['G:Signed in as {m0o}{m0c}']);
    });

    // Notation is opaque in a phrase the same way (TOK-1).
    it('a value split inside <math> in a <Phrase> registers the phrase without it', async () => {
        const texts: string[] = [];
        for (const n of [3, 4]) {
            texts.push(await show(el(Phrase, { category: 'Q' }, 'Total ', el('math', null, el('mn', null, 'n = ', n)), ' units')));
        }
        await until(async () => (await stored()).some((s) => s.startsWith('Q:')));
        await sleep(1000);
        expect(texts).toEqual(['Total n = 3 units', 'Total n = 4 units']);
        expect((await stored()).filter((s) => s.startsWith('Q:'))).toEqual(['Q:Total {m0o}{m0c} units']);
    });

    // A block stores that subtree in its content, so there the value still registers nothing.
    it('a value split inside <DontTranslate> in a <Translate> registers nothing', async () => {
        for (const name of ['Ana', 'Bo']) await show(el(Translate, { category: 'K' }, el('p', null, 'Signed in as ', el(DontTranslate, null, 'user ', name))));
        await control('K');
        await sleep(1500);
        expect((await stored()).filter((s) => s.startsWith('K:'))).toEqual([]);
    });

    // The DOM-class path: a block holding a component falls back to the core's Translate class,
    // which honours the same `register: false`.
    it('a fallback block (it holds a component) with an interpolated value registers nothing either', async () => {
        const Badge = () => el('b', null, 'new');
        for (const name of ['Ana', 'Bo']) await show(el(Translate, { category: 'D' }, el('p', null, 'Welcome ', name), el(Badge)));
        await control('D');
        await sleep(1500);
        expect((await stored()).filter((s) => s.startsWith('D:'))).toEqual([]);
    });

    // Raw HTML is content, not a variable: a block whose only dynamic part is an HTML insertion
    // registers that HTML's text through the DOM path; one that also interpolates a value does not.
    it('a block whose only dynamic part is raw HTML registers its text as content', async () => {
        const cms = { __html: '<p>Welcome to our store</p><p>Free shipping today</p>' };
        for (let i = 0; i < 2; i++) await show(el(Translate, { category: 'H' }, el('div', { dangerouslySetInnerHTML: cms })));
        await until(async () => (await stored()).some((s) => s.startsWith('H:')));
        await sleep(1000);
        expect((await stored()).filter((s) => s.startsWith('H:'))).toEqual([`H:${block('Welcome to our store', 'Free shipping today')}`]);
    });

    it('a block mixing raw HTML with an interpolated value registers nothing', async () => {
        const cms = { __html: '<p>Mixed store banner</p>' };
        for (const name of ['Ana', 'Bo']) {
            await show(el(Translate, { category: 'M' }, el('p', null, 'Hi ', name), el('div', { dangerouslySetInnerHTML: cms })));
        }
        await control('M');
        await sleep(1500);
        expect((await stored()).filter((s) => s.startsWith('M:'))).toEqual([]);
    });

    it('the core reports it once, as a debug notice naming the transform', async () => {
        const debugWas = logger.debugEnabled;
        logger.debugEnabled = true;
        const notice = vi.spyOn(console, 'log').mockImplementation(() => {});
        for (const name of ['Cy', 'Di']) await show(el(Translate, { category: 'E' }, 'Bye ', name));
        logger.debugEnabled = debugWas;
        const messages = notice.mock.calls
            .map((c) => c.join(' '))
            .filter((m) => m.includes('a value the build transform did not name'));
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('langsys-js-react/vite, /babel or /next');
        expect(messages[0]).toContain('a conditional, which it leaves as written');
    });

    it('a unit the build transform flagged reports where it left a value as written', async () => {
        const debugWas = logger.debugEnabled;
        logger.debugEnabled = true;
        const notice = vi.spyOn(console, 'log').mockImplementation(() => {});
        await show(el(Translate, { category: 'E', 'data-ls-unnamed': '' }, el('p', null, 'Notes'), el('textarea', { translate: 'no', defaultValue: 'x' })));
        logger.debugEnabled = debugWas;
        const messages = notice.mock.calls.map((c) => c.join(' ')).filter((m) => m.includes('a value the build transform left as written'));
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('inside MathML or SVG, <script> or <style>, or an element that holds text only');
    });

    it('a phrase the build transform flagged reports where it left a value as written', async () => {
        const debugWas = logger.debugEnabled;
        logger.debugEnabled = true;
        const notice = vi.spyOn(console, 'log').mockImplementation(() => {});
        notice.mockClear();
        await show(el(Phrase, { category: 'E', 'data-ls-unnamed': '' }, 'Rated ', el('svg', null, el('title', null, 'stars'))));
        logger.debugEnabled = debugWas;
        const messages = notice.mock.calls.map((c) => c.join(' ')).filter((m) => m.includes('a value the build transform left as written'));
        expect(messages).toHaveLength(1);
        expect(messages[0]).toContain('in a phrase whose values are all marked: in a translated <svg>, or an element that holds text only');
    });
});
