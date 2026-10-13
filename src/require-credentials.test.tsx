// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LangsysApp, LangsysConfigurationError, Phrase, Translate, createLocaleStore } from './index.js';
import { LangsysConfigurationError as fromServerEntry } from './server.js';
import { LangsysConfigurationError as fromCore } from 'langsys-js-typescript';

/**
 * WIRE-4 under `requireCredentials`: `init()` without a key leaves the client unconfigured, and the
 * core's `registerBlock` rejects with `LangsysConfigurationError`. React has no lifecycle that takes
 * a promise, so `<Translate>` and `<Phrase>` on the tree path leave that promise unhandled on
 * purpose, and the failure surfaces as an unhandled rejection, once per block, while the page still
 * shows the text as written. A block that falls back to the core's DOM class surfaces it from the
 * class's own render. Its own file: a second `init()` in one process is a no-op.
 *
 * The runner's own unhandled-rejection listeners are set aside for the mount and restored after,
 * so the rejections are collected here rather than failing the run.
 */

function Name() {
    return 'Ana';
}

const rejections: unknown[] = [];
const collect = (reason: unknown) => void rejections.push(reason);
let runnerListeners: NodeJS.UnhandledRejectionListener[] = [];
let el: HTMLElement;
let root: Root;

beforeAll(async () => {
    runnerListeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', collect);

    const res = await LangsysApp.init({
        projectid: 'p1',
        key: '',
        UserLocaleStore: createLocaleStore('it'),
        requireCredentials: true,
    });
    expect(res.status, 'control: the client is unconfigured').toBe(false);
    expect(LangsysApp.isConfigured()).toBe(false);

    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    await act(async () => {
        root.render(
            createElement(
                'div',
                null,
                createElement(Translate, { category: 'UI' }, createElement('p', null, 'Hello'), createElement('p', null, 'World')),
                createElement(Phrase, { category: 'UI' }, 'Hello ', createElement('b', null, 'world')),
                // Holds a component, so it falls back to the core's DOM class after mount.
                createElement(Translate, { category: 'UI' }, createElement('p', null, createElement(Name))),
                // Values the transform did not name: `register: false` blocks, which only read and
                // never reject (a tree-path <Translate>, a fallback <Translate>, a <Phrase>).
                createElement(Translate, { category: 'UI' }, createElement('p', null, 'Welcome ', 'Bo'), createElement('p', null, 'Two')),
                createElement(Translate, { category: 'UI' }, createElement('p', null, 'Welcome ', 'Cy'), createElement(Name)),
                createElement(Phrase, { category: 'UI' }, 'Hey ', 'Di', createElement('b', null, '!')),
            ),
        );
    });
    // Past the core's 500 ms settle window, after which a DOM-class block reads its content.
    await new Promise((r) => setTimeout(r, 700));
});

afterAll(() => {
    act(() => root.unmount());
    el.remove();
    process.removeListener('unhandledRejection', collect);
    for (const listener of runnerListeners) process.on('unhandledRejection', listener);
});

describe('requireCredentials with no credentials', () => {
    it("each block's failure surfaces as an unhandled LangsysConfigurationError", () => {
        // Two from the tree path's registerBlock, one from the DOM class's render; none from the
        // three `register: false` blocks.
        expect(rejections).toHaveLength(3);
        for (const reason of rejections) expect(reason).toBeInstanceOf(LangsysConfigurationError);
    });

    it('the page still shows the text as written', () => {
        expect(el.textContent).toBe('HelloWorldHello worldAnaWelcome BoTwoWelcome CyAnaHey Di!');
    });

    it('the error class is the core’s, from both entries', () => {
        expect(LangsysConfigurationError).toBe(fromCore);
        expect(fromServerEntry).toBe(fromCore);
    });
});
