// @vitest-environment jsdom
/**
 * A server render opens no subscription on the core's signals, so nothing accumulates per
 * request in a long-lived server process.
 *
 * React's server renderer never calls `useSyncExternalStore`'s `subscribe` or runs effects, so
 * every hook this binding exports reads its value once and holds nothing. Measured here by
 * counting subscribe calls and the unsubscribes they return, on every core signal a hook reads,
 * across 50 server renders of a page using all of them. The control is a client render mounted
 * and unmounted: one subscription opened and released per signal, which shows the counters see
 * a real subscription.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentlyLoadedLocale, sTranslations, tSignal, writeEnabled } from 'langsys-js-typescript';
import {
    useCurrentLocale,
    useLocaleStore,
    useNotifyNavigation,
    useRenderServerMessage,
    useSignal,
    useT,
    useTranslations,
    useWriteEnabled,
} from './index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Subscribable = { subscribe: (fn: (v: never) => void) => () => void };
const SIGNALS = { tSignal, currentlyLoadedLocale, sTranslations, writeEnabled } as unknown as Record<string, Subscribable>;
const counts: Record<string, { opened: number; released: number }> = {};
const originals: Record<string, Subscribable['subscribe']> = {};

beforeAll(() => {
    for (const [name, signal] of Object.entries(SIGNALS)) {
        counts[name] = { opened: 0, released: 0 };
        const original = signal.subscribe;
        originals[name] = original;
        signal.subscribe = (fn) => {
            counts[name].opened++;
            const unsubscribe = original.call(signal, fn);
            return () => {
                counts[name].released++;
                unsubscribe();
            };
        };
    }
});
afterAll(() => {
    for (const [name, signal] of Object.entries(SIGNALS)) signal.subscribe = originals[name];
});

function reset() {
    for (const c of Object.values(counts)) c.opened = c.released = 0;
}
const totals = () => Object.values(counts).reduce((a, c) => ({ opened: a.opened + c.opened, released: a.released + c.released }), { opened: 0, released: 0 });

function Page() {
    const t = useT();
    const locale = useCurrentLocale();
    const catalog = useTranslations();
    const [userLocale] = useLocaleStore('it');
    const writable = useWriteEnabled();
    const render = useRenderServerMessage();
    const raw = useSignal(currentlyLoadedLocale);
    useNotifyNavigation('/a');
    return createElement(
        'p',
        null,
        [t('Pricing', 'UI'), locale, Object.keys(catalog).length, userLocale, String(writable), raw,
            render({ template: 'Required', message: 'Required' })].join('|'),
    );
}

describe('subscriptions on the core signals', () => {
    it('50 server renders open none', () => {
        reset();
        for (let i = 0; i < 50; i++) renderToString(createElement(Page));
        expect(counts).toEqual(Object.fromEntries(Object.keys(SIGNALS).map((n) => [n, { opened: 0, released: 0 }])));
    });

    it('control: a client render mounted then unmounted opens and releases each one', async () => {
        reset();
        const host = document.createElement('div');
        const root = createRoot(host);
        await act(async () => root.render(createElement(Page)));
        const mounted = totals();
        await act(async () => root.unmount());
        expect(mounted.opened).toBeGreaterThan(0);
        expect(mounted.released).toBe(0);
        for (const [name, c] of Object.entries(counts)) {
            expect(c.opened, name).toBeGreaterThan(0);
            expect(c.released, name).toBe(c.opened);
        }
    });
});
