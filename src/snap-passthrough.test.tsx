// @vitest-environment jsdom
/**
 * A catalog snapshot reaches the core through this binding untouched (spec SNAP-2, SNAP-3).
 *
 * Loading is the core's: `LangsysApp` here is the core singleton by reference, so
 * `LangsysApp.loadSnapshot` is the core's own synchronous loader, and `useT()` reads the catalog
 * it publishes. The binding's half is that a component's first render sees it: loaded before
 * the root mounts, with no `init()` and no network, the first commit already shows the
 * snapshot's translation. A phrase the snapshot lacks renders as source text, and an edited
 * snapshot is refused with the re-exported `SnapshotError`.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSnapshot } from 'langsys-js-typescript';
import { LangsysApp, SnapshotError, useT, type CatalogSnapshot } from './index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SNAPSHOT: CatalogSnapshot = buildSnapshot({
    projectId: '11111111-2222-3333-4444-555555555555',
    baseLocale: 'en',
    catalogs: { 'es-es': { UI: { Pricing: 'Precios' } } },
    categories: ['UI'],
    generatedAt: new Date('2026-09-24T12:00:00Z'),
});

function Lines() {
    const t = useT();
    return createElement('p', null, `${t('Pricing', 'UI')}|${t('Checkout', 'UI')}`);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SNAP — a snapshot passes through this binding to the core', () => {
    it('loaded before mount, the first render shows its translation, with no fetch', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        expect(LangsysApp.loadSnapshot(SNAPSHOT, 'es-es')).toBe(true);

        const host = document.createElement('div');
        const root = createRoot(host);
        const firstCommits: string[] = [];
        function Probe() {
            const t = useT();
            firstCommits.push(t('Pricing', 'UI'));
            return createElement(Lines);
        }
        await act(async () => root.render(createElement(Probe)));

        expect(firstCommits[0]).toBe('Precios');
        // A phrase the snapshot lacks is source text.
        expect(host.textContent).toBe('Precios|Checkout');
        expect(fetchSpy).not.toHaveBeenCalled();
        await act(async () => root.unmount());
    });

    it('an edited snapshot is refused by its checksum, as the re-exported SnapshotError', () => {
        const edited = {
            ...SNAPSHOT,
            catalog: { 'es-es': { UI: { Pricing: 'Precios editados' } } },
        } as CatalogSnapshot;
        let caught: unknown;
        try {
            LangsysApp.loadSnapshot(edited, 'es-es');
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(SnapshotError);
        expect((caught as SnapshotError).reason).toBe('checksum');
    });
});
