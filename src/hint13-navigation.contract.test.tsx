// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/a"}
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router';
import { LangsysApp, createLocaleStore, useNotifyNavigation, useT } from './index.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';

/**
 * HINT-13 against the contract double (tier `contract`), through React Router's BrowserRouter.
 *
 * A persistent layout sits beside the routes as a stable element. React skips re-rendering a
 * subtree whose element is unchanged, so on a route change the layout never looks its phrase
 * up again and the new page is never credited with it. `useNotifyNavigation` makes it re-enter.
 *
 * Asserted on the double's accepted state: a hint for page B exists with the hook, and does
 * not exist without it. The key is read-only from here and permitted to report, so the double
 * stores any hint the SDK sends — an absent hint means the SDK sent none.
 */

let fx: ContractFixture;
const SEED = {
    config: { renderer_egress_ips: ['10.9.9.9'] },
    projects: [{ id: 'p1', base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local' }],
    keys: [{ key: 'k-public', project: 'p1', type: 'ip_write', report_discovered_content: true }],
};
const hints = async () => (await fx.state()).hints.map((h) => h.url);

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
    await fx.seed(SEED);
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await LangsysApp.init({
        projectid: 'p1',
        key: 'k-public',
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

    it('without it, the same layout records nothing for page D, though the double would store it', async () => {
        window.history.pushState({}, '', '/c');
        const root = await mount(false);
        await runOutJitter();
        // Premise: the layout does report on the page it mounted on, so a missing D is a real absence.
        await until(async () => (await hints()).includes('https://site.local/c'));

        await act(async () => navigate('/d'));
        expect(window.location.href).toBe('https://site.local/d');
        await runOutJitter();
        await sleep(600);
        expect(await hints()).not.toContain('https://site.local/d');
        await act(async () => root.unmount());
    });
});

