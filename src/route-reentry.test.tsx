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

/**
 * A module-level element object, created once. This is the shape real routers
 * and children-pass-through layouts produce, and React bails out of re-rendering
 * an identical element reference — so it answers differently from the recreated
 * shape above. Hoisted here rather than inside a component precisely so the
 * reference is stable across renders.
 */
let HOISTED_LAYOUT: ReturnType<typeof createElement>;

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

/**
 * Layout element RECREATED each render. Note this is NOT the hoisted shape —
 * `createElement(PersistentLayout)` below runs on every render of this
 * component, producing a fresh element object each time. An earlier revision of
 * this file described it as "a stable element reference" and drew a conclusion
 * from it that the code did not support; the truly hoisted shape is measured
 * separately below and answers differently.
 */
function AppRecreatedElement({ nav }: { nav: (fn: () => void) => void }) {
    const [route, setRoute] = useState('a');
    useEffect(() => nav(() => setRoute((r) => (r === 'a' ? 'b' : 'a'))), [nav]);
    return createElement('div', null, createElement(PersistentLayout), createElement(Page, { name: route }));
}

function AppHoistedElement({ nav }: { nav: (fn: () => void) => void }) {
    const [route, setRoute] = useState('a');
    useEffect(() => nav(() => setRoute((r) => (r === 'a' ? 'b' : 'a'))), [nav]);
    return createElement('div', null, HOISTED_LAYOUT, createElement(Page, { name: route }));
}

HOISTED_LAYOUT = createElement(PersistentLayout);

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
                createElement(AppRecreatedElement, { nav: (fn: () => void) => { navigate = fn; } }),
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

        // MEASURED — recreated-element shape: 2 of 2 re-enter t().
        // React re-renders the subtree of the component holding route state, and
        // because the layout element is rebuilt each render there is nothing to
        // bail out on. This is the FAVOURABLE shape; it is not the only one, and
        // it is not the one real routers produce — see the hoisted case below.
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

/**
 * FINDING — the adverse shape, recorded rather than avoided.
 *
 * A layout held as a STABLE element reference (module-level, or the
 * `children`-pass-through shape every real router produces) does NOT re-enter
 * `t()` on a client-side route change: React bails out on an identical element
 * reference before the component body runs.
 *
 * That is the persistent-layout discovery gap. Because the core re-records
 * discovery per URL before its own dedup, phrases rendered only by that layout
 * are never re-offered on the new URL, so the new URL is never credited with
 * them. React is the fourth framework to confirm it in this shape.
 *
 * It is NOT fixable inside this binding: there is no memo to correct and no
 * re-render to force without overriding React's own bail-out, which would be
 * this binding implementing behaviour rather than delegating (BIND-1). Routed
 * core-side; graded as a finding in CONFORMANCE.md rather than as a pass.
 */
describe('BIND-5 finding — stable element references do not re-enter', () => {
    it('a hoisted persistent layout does NOT re-enter t() on navigation', async () => {
        let navigate!: () => void;
        const container = document.createElement('div');
        document.body.appendChild(container);

        await act(async () => {
            createRoot(container).render(
                createElement(AppHoistedElement, { nav: (fn: () => void) => { navigate = fn; } }),
            );
        });

        // Premise: both rendered initially, so a later zero means "did not
        // re-enter", not "was never there".
        expect(calls.filter((c) => c === 'layout').length).toBeGreaterThan(0);

        calls.length = 0;
        await act(async () => { navigate(); });

        const layoutAfter = calls.filter((c) => c === 'layout').length;
        const pageAfter = calls.filter((c) => c.startsWith('page:')).length;

        // MEASURED: layout 0, page 1. Pinned as the current adverse answer — if
        // React's bail-out changes, or the core grows a per-URL re-offer that
        // does not depend on re-render, this goes red and the finding is stale.
        expect(layoutAfter).toBe(0);
        expect(pageAfter).toBeGreaterThan(0);
    });
});
