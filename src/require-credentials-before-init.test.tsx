// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LangsysApp, LangsysConfigurationError, Phrase, Translate, useLocaleStore } from './index.js';

/**
 * WIRE-4 under `requireCredentials`, in the order React runs an app that calls `init()` in its own
 * effect and renders its blocks at once: a child's effect runs before its parent's, so every block
 * registers, and the DOM-class block starts its render, before `init()` is called. Once `init()`
 * refuses for a missing key, each of them rejects with `LangsysConfigurationError`, unhandled, and
 * the page shows the text as written. Its own file: a second `init()` in one process is a no-op.
 *
 * The runner's own unhandled-rejection listeners are set aside for the mount and restored after,
 * so the rejections are collected here rather than failing the run.
 */

function Name() {
    return 'Ana';
}

const order: string[] = [];
let refused: boolean | undefined;

function App() {
    const [, , localeStore] = useLocaleStore('it');
    useEffect(() => {
        order.push('init');
        void LangsysApp.init({ projectid: 'p1', key: '', UserLocaleStore: localeStore, requireCredentials: true }).then(
            (res) => void (refused = !res.status),
        );
    }, [localeStore]);
    return createElement(
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
        createElement(Probe),
    );
}

/** A sibling after the blocks: its effect runs after theirs and before the parent's. */
function Probe() {
    useEffect(() => void order.push('blocks mounted'), []);
    return null;
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

    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    await act(async () => root.render(createElement(App)));
    // Past the core's 500 ms settle window, after which the DOM-class block reads its content.
    await new Promise((r) => setTimeout(r, 700));
});

afterAll(() => {
    act(() => root.unmount());
    el.remove();
    process.removeListener('unhandledRejection', collect);
    for (const listener of runnerListeners) process.on('unhandledRejection', listener);
});

describe('requireCredentials with blocks mounted before init()', () => {
    it('control: the blocks mounted before init() was called, and init() refused', () => {
        expect(order).toEqual(['blocks mounted', 'init']);
        expect(refused).toBe(true);
    });

    it('each block rejects with LangsysConfigurationError once init() refuses', () => {
        // Two from the tree path's registerBlock, one from the DOM class's render; none from the
        // three `register: false` blocks.
        expect(rejections).toHaveLength(3);
        for (const reason of rejections) expect(reason).toBeInstanceOf(LangsysConfigurationError);
    });

    it('the page still shows the text as written', () => {
        expect(el.textContent).toBe('HelloWorldHello worldAnaWelcome BoTwoWelcome CyAnaHey Di!');
    });
});
