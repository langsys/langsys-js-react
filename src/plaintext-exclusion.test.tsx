// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * TOK-1's `<plaintext>` Test, through both components: a unit holding a sentence once in ordinary
 * markup and again inside `<plaintext>` registers exactly the ordinary phrase, and renders the
 * text inside `<plaintext>` as written. Whether an element is excluded is the core's
 * `NON_TRANSLATABLE_ELEMENTS`; the binding hands it the element as React renders it.
 */
import { act, createElement as el, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { NON_TRANSLATABLE_ELEMENTS } from 'langsys-js-typescript/pure';
import { LangsysApp, Phrase, Translate, createLocaleStore } from './index.js';
import { renderInRequestScope } from './server.js';
import { until as untilPolling } from './test-helpers/contract-fixture.js';
import { catalog } from './test-helpers/ssr-scope.js';
import { STUB_API_URL, stubApi, type StubbedApi } from './test-helpers/stub-api.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SENTENCE = 'Plaintext keeps this sentence';
const TRANSLATED = 'Plaintext conserva esta frase';
const until = (check: () => boolean, timeoutMs = 8000) => untilPolling(check, timeoutMs, 25);

let api: StubbedApi;
const consoleSpies: MockInstance[] = [];

beforeAll(async () => {
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        consoleSpies.push(vi.spyOn(console, m).mockImplementation(() => {}));
    }
    api = stubApi();
    await LangsysApp.init({
        projectid: 'stub-project',
        key: 'stub-key',
        UserLocaleStore: createLocaleStore('en'),
        baseLocale: 'en',
        apiUrl: STUB_API_URL,
        debug: true,
    } as never);
});
afterAll(() => {
    api.restore();
    for (const spy of consoleSpies) spy.mockRestore();
});

async function mount(tree: ReactNode) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(tree));
    return {
        host,
        unmount: async () => {
            await act(async () => root.unmount());
            host.remove();
        },
    };
}

/** Every phrase sent, from phrase items and from content blocks, with the category it was sent under. */
const sentPhrases = (category: string) =>
    api
        .items()
        .filter((i) => i.category === category)
        .flatMap((i) =>
            i.type === 'content_block' ? (i.phrases as Array<{ phrase: string }>).map((p) => p.phrase) : [String(i.phrase)],
        );

it('plaintext is one of the elements the core excludes', () => {
    expect(NON_TRANSLATABLE_ELEMENTS).toContain('plaintext');
});

describe('a sentence in ordinary markup and again inside <plaintext>', () => {
    it('<Translate> registers only the ordinary phrase', async () => {
        const { unmount } = await mount(
            el(Translate, { category: 'PT-block' }, el('p', null, SENTENCE), el('plaintext', null, SENTENCE)),
        );
        await until(() => sentPhrases('PT-block').length > 0);
        expect(sentPhrases('PT-block')).toEqual([SENTENCE]);
        await unmount();
    });

    it('<Phrase> registers the ordinary sentence, with <plaintext> as one empty pair', async () => {
        const { unmount } = await mount(el(Phrase, { category: 'PT-phrase' }, SENTENCE, el('plaintext', null, SENTENCE)));
        await until(() => sentPhrases('PT-phrase').length > 0);
        expect(sentPhrases('PT-phrase')).toEqual([`${SENTENCE}{m0o}{m0c}`]);
        await unmount();
    });

    it('a translation renders the ordinary sentence translated and the text inside <plaintext> as written', async () => {
        const ES = catalog({ UI: { [SENTENCE]: TRANSLATED, [`${SENTENCE}{m0o}{m0c}`]: `${TRANSLATED}{m0o}{m0c}` } });
        const block = el(Translate, { category: 'UI' }, el('p', null, SENTENCE), el('plaintext', null, SENTENCE));
        const phrase = el(Phrase, { category: 'UI' }, SENTENCE, el('plaintext', null, SENTENCE));
        const { result: html, close } = await renderInRequestScope({ locale: 'es-es', catalog: ES }, () =>
            renderToString(el('div', null, block, phrase)),
        );
        await close();
        expect(html).toContain(`<p>${TRANSLATED}</p><plaintext>${SENTENCE}</plaintext>`);
        expect(html).toContain(`${TRANSLATED}<plaintext>${SENTENCE}</plaintext>`);
        expect(html.split(TRANSLATED)).toHaveLength(3);
    });
});
