// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/a"}
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router';
import { LangsysApp, createLocaleStore, useNotifyNavigation, useT } from './index.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';
import seeds from './test-helpers/contract-seeds/hint13.js';
import type { World } from './test-helpers/contract-worlds.js';

/**
 * HINT-13 against the API on an SDK test clone (tier `contract`, spec CONF-2), through React
 * Router's BrowserRouter.
 *
 * A persistent layout sits beside the routes as a stable element. React skips re-rendering a
 * subtree whose element is unchanged, so on a route change the layout never looks its phrase
 * up again and the new page is never credited with it. `useNotifyNavigation` makes it re-enter.
 *
 * Asserted on the hints the clone accepted for the project, read back through the forwarder's
 * reader: a hint for page B exists with the hook, and does not exist without it. The project
 * machine-translates new content and the key is read-only from here and permitted to report, so
 * the API stores any hint the SDK sends and the case's address is under the hint rate — an absent
 * hint means the SDK sent none.
 */

let fx: ContractFixture;
let w: World;
const hints = async () => (await fx.hints(w)).map((h) => h.url);

function PersistentLayout() {
    const t = useT();
    return createElement('header', null, t('Layout phrase', 'UI'));
}
const LAYOUT = createElement(PersistentLayout);

function Page({ name }: { name: string }) {
    return createElement('main', null, name);
}

let navigate!: NavigateFunction;
function Controls({ notify }: { notify: boolean }) {
    navigate = useNavigate();
    return notify ? createElement(NotifyOnNavigate) : null;
}
function NotifyOnNavigate() {
    useNotifyNavigation(useLocation().key);
    return null;
}

function app(notify: boolean): ReactElement {
    return createElement(
        BrowserRouter,
        null,
        LAYOUT,
        createElement(Controls, { notify }),
        createElement(
            Routes,
            null,
            ...['a', 'b', 'c', 'd'].map((n) => createElement(Route, { key: n, path: `/${n}`, element: createElement(Page, { name: n }) })),
        ),
    );
}

async function mount(notify: boolean): Promise<Root> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(app(notify)));
    return root;
}

/** Run out the 5–30s report jitter so anything queued goes out now. */
const runOutJitter = () => act(async () => void (await vi.advanceTimersByTimeAsync(31_000)));

beforeAll(async () => {
    fx = await startContractFixture();
    w = seeds.take('base');
    await fx.use(w);
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await LangsysApp.init({
        projectid: w.project(),
        key: w.key('k-public'),
        UserLocaleStore: createLocaleStore('es-es'),
        baseLocale: 'en',
        apiUrl: fx.baseUrl,
    } as never);
    await until(() => LangsysApp.Translations !== undefined);
});
afterAll(async () => {
    vi.useRealTimers();
    await fx.stop();
});
beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'], shouldAdvanceTime: true });
});

describe('HINT-13 — a route change re-enters the SDK', () => {
    it('with useNotifyNavigation, the persistent layout is reported for page B', async () => {
        window.history.pushState({}, '', '/a');
        const root = await mount(true);
        await runOutJitter();
        await until(async () => (await hints()).includes('https://site.local/a'));

        await act(async () => navigate('/b'));
        expect(window.location.href).toBe('https://site.local/b');
        await runOutJitter();
        await until(async () => (await hints()).includes('https://site.local/b'));
        await act(async () => root.unmount());
    });

    it('without it, the same layout records nothing for page D, though the API would store it', async () => {
        // The first case's hints are counted against the address's hint rate (5 a minute); the
        // second runs from an address of its own, as a visitor on another network would.
        await fx.update(w, { caller: w.moved });
        window.history.pushState({}, '', '/c');
        const root = await mount(false);
        await runOutJitter();
        // Premise: the layout does report on the page it mounted on, so a missing D is a real absence.
        await until(async () => (await hints()).includes('https://site.local/c'));

        await act(async () => navigate('/d'));
        expect(window.location.href).toBe('https://site.local/d');
        await runOutJitter();
        await sleep(3000);
        expect(await hints()).not.toContain('https://site.local/d');
        await act(async () => root.unmount());
    });
});

