import { describe, expect, it } from 'vitest';
import * as core from 'langsys-js-typescript';

/**
 * Guards the bench, not the binding.
 *
 * This package resolves `langsys-js-typescript` through a symlink into the
 * sibling working copy (see CLAUDE.md — dev-mode symlinked deps). Every other
 * suite here is only meaningful if that link resolves to a build carrying the
 * 838 surface. Swap the link for the published tarball and the write-gating
 * tests fail with import errors that read like binding defects rather than a
 * missing upstream.
 *
 * So assert the upstream surface explicitly, with a positive control: if the
 * control also fails, the package didn't load at all and the other rows are
 * telling you about the loader, not about exports.
 */
describe('upstream precondition — the core build under test', () => {
    it('positive control: the package resolves and its baseline surface is present', () => {
        // Present in every published build, 838 or not. If this fails, nothing
        // below is evidence about 838 — the module simply is not loading.
        expect(typeof core.generateCustomId).toBe('function');
        expect(typeof core.canonicalizeLocale).toBe('function');
    });

    it('carries the 838 write-gating surface', () => {
        expect(typeof core.writeEnabled).toBe('object'); // Signal<boolean | undefined>
        expect(typeof core.setWriteGrant).toBe('function');
        expect(typeof core.autoDiscovery).toBe('object'); // Signal<boolean | undefined>
    });

    it('exposes the signal contract the hooks depend on', () => {
        // useSyncExternalStore needs subscribe/get; a shape change here breaks
        // every hook in this package before any of them is wrong.
        for (const sig of [core.writeEnabled, core.autoDiscovery, core.currentlyLoadedLocale]) {
            expect(typeof sig.subscribe).toBe('function');
            expect(typeof sig.get).toBe('function');
        }
    });
});
