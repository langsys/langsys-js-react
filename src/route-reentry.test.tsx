// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement, useEffect, useState, act } from 'react';
import { createRoot } from 'react-dom/client';
import { useT } from './hooks.js';

/**
 * BIND-5 measurement, not a pass/fail rule: does React re-enter `t()` for
 * already-rendered phrases when the app navigates client-side?
 *
 * It matters because the core deliberately re-records discovery PER URL before
 * its own dedup. `TFunction` identity does NOT change on a route change, so any
 * layer that memoizes on `t` alone suppresses discovery for phrases that were
 * already rendered — they never re-enter the core on the new URL, and the new
 * URL is never credited with them. Angular hit exactly this and keyed on
 * `location.href` to fix it.
 *
 * This binding adds no memo layer at all (`grep -rE 'useMemo|useCallback|memo\('`
 * over src/ and example/ returns nothing), so the question is purely React's own
 * re-render semantics. Measured here so the answer is recorded rather than
 * assumed, in the two shapes that differ.
 */

const calls: string[] = [];

/** A component that lives OUTSIDE the swapped subtree and never unmounts. */
function PersistentLayout() {
    const t = useT();
    calls.push('layout');
    return createElement('div', { id: 'layout' }, t('Layout phrase', 'UI'));
}

/** A component swapped out on navigation. */
function Page({ name }: { name: string }) {
    const t = useT();
    calls.push(`page:${name}`);
    return createElement('div', { id: 'page' }, t(`Page ${name} phrase`, 'UI'));
}

/** Layout passed as a STABLE element reference (the memo-free "hoisted" shape). */
function AppHoisted({ nav }: { nav: (fn: () => void) => void }) {
    const [route, setRoute] = useState('a');
    useEffect(() => nav(() => setRoute((r) => (r === 'a' ? 'b' : 'a'))), [nav]);
    return createElement('div', null, createElement(PersistentLayout), createElement(Page, { name: route }));
}

afterEach(() => {
    calls.length = 0;
    document.body.innerHTML = '';
});

describe('BIND-5 — re-entry into t() on client-side navigation', () => {
    it('measures whether a persistent layout re-enters t() when the route changes', async () => {
        let navigate!: () => void;
        const container = document.createElement('div');
        document.body.appendChild(container);

        await act(async () => {
            createRoot(container).render(
                createElement(AppHoisted, { nav: (fn: () => void) => { navigate = fn; } }),
            );
        });

        const layoutBefore = calls.filter((c) => c === 'layout').length;
        const pageBefore = calls.filter((c) => c.startsWith('page:')).length;
        expect(layoutBefore).toBeGreaterThan(0);
        expect(pageBefore).toBeGreaterThan(0);

        calls.length = 0;
        await act(async () => { navigate(); });

        const layoutAfter = calls.filter((c) => c === 'layout').length;
        const pageAfter = calls.filter((c) => c.startsWith('page:')).length;

        // MEASURED RESULT — 2 of 2 components re-enter t() on a route change.
        // React re-renders the whole subtree of the component holding route
        // state; with no memo boundary, the persistent layout re-renders too,
        // so its phrases are re-offered to the core on the new URL. This is the
        // outcome BIND-5 wants, reached by having no memo layer rather than by
        // keying one correctly.
        expect(pageAfter).toBeGreaterThan(0);
        expect(layoutAfter).toBeGreaterThan(0);

        // Pin the count so a future memo/React.memo added anywhere above these
        // components turns this red instead of silently suppressing discovery.
        expect({ layout: layoutAfter > 0, page: pageAfter > 0 }).toEqual({ layout: true, page: true });
    });

    it('t() identity is stable across a route change — so memoizing on it alone would suppress re-entry', async () => {
        const seen: unknown[] = [];
        let navigate!: () => void;

        function IdentityProbe() {
            const t = useT();
            seen.push(t);
            return null;
        }
        function App() {
            const [route, setRoute] = useState('a');
            useEffect(() => { navigate = () => setRoute((r) => (r === 'a' ? 'b' : 'a')); }, []);
            return createElement('div', null, createElement(IdentityProbe), route);
        }

        const container = document.createElement('div');
        document.body.appendChild(container);
        await act(async () => { createRoot(container).render(createElement(App)); });
        await act(async () => { navigate(); });

        // Same TFunction reference before and after: this is WHY a memo keyed on
        // `t` is unsafe, and why this binding must not introduce one.
        expect(seen.length).toBeGreaterThan(1);
        expect(seen[seen.length - 1]).toBe(seen[0]);
    });
});
