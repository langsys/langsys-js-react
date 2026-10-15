// @vitest-environment jsdom
/**
 * WIRE-4 with `requireCredentials` off, the default: an app with no API key or project id boots,
 * and renders its source text with params filled through `useT()`, `<Translate>` and `<Phrase>`,
 * while the core makes no request. Its own file: a second `init()` in one process is a no-op.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el } from 'react';
import { createRoot } from 'react-dom/client';
import { LangsysApp, Phrase, Translate, createLocaleStore, useT } from './index.js';

const requests: string[] = [];

function Greeting() {
    const t = useT();
    return el('span', null, t('Hello {name}', 'UI', { name: 'Ana' }));
}

beforeAll(() => {
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
        requests.push(String(url));
        return real(url, init);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => vi.unstubAllGlobals());

describe('an app with no credentials', () => {
    it('boots, renders source with params filled, and fetches nothing', async () => {
        let boot: Promise<unknown> | undefined;
        expect(() => {
            boot = LangsysApp.init({ projectid: '', key: '', UserLocaleStore: createLocaleStore('it') });
        }).not.toThrow();
        await boot;
        expect(LangsysApp.isConfigured()).toBe(false);

        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () =>
            root.render([
                el(Greeting, { key: 'g' }),
                el(Translate, { key: 'b', category: 'UI' }, el('p', null, 'Hello'), el('p', null, 'World')),
                el(Phrase, { key: 'p', category: 'UI' }, 'Read ', el('b', null, 'this')),
            ])
        );
        await act(async () => new Promise((r) => setTimeout(r, 700)));

        expect(host.textContent).toBe('Hello AnaHelloWorldRead this');
        expect(requests).toEqual([]);
        await act(async () => root.unmount());
        host.remove();
    });
});
