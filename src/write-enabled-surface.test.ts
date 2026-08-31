import { describe, expect, it } from 'vitest';
import * as core from 'langsys-js-typescript';
import * as react from './index.js';

/**
 * Pins a DELIBERATE ABSENCE.
 *
 * This binding does not re-export the raw `writeEnabled` signal — see the
 * reasoning at the export site in `src/index.ts`. An absence decided on purpose
 * is one innocent export-line edit away from silently reverting, and nothing
 * else in the suite would notice: adding the export breaks no test, it just
 * quietly re-opens a way to defeat the hydration guard.
 *
 * The positive controls matter as much as the assertion. An absence test with
 * no control passes just as happily when the import failed entirely, when the
 * core stopped exporting the signal, or when this package exports nothing at
 * all — three ways to be green while proving nothing.
 */
describe('writeEnabled is deliberately not re-exported', () => {
    it('positive control: the core DOES export the raw signal', () => {
        // Without this, absence below could mean "the core dropped it", which is
        // a different and much larger problem than a binding surface choice.
        expect(core).toHaveProperty('writeEnabled');
        expect(typeof core.writeEnabled.subscribe).toBe('function');
    });

    it('positive control: this package loaded and exposes the adapted access path', () => {
        // Without this, absence could mean the module failed to load.
        expect(typeof react.useWriteEnabled).toBe('function');
        expect(typeof react.setWriteGrant).toBe('function');
    });

    it('does not re-export the raw signal', () => {
        expect(react).not.toHaveProperty('writeEnabled');
    });

    it('still re-exports the SSR-safe raw signals, so this is a targeted omission', () => {
        // The distinction being encoded: these three are seeded by
        // `initialTranslations` before a server render and are safe to read raw.
        // Losing them would mean the omission was overzealous rather than aimed.
        for (const name of ['t', 'currentlyLoadedLocale', 'sTranslations', 'createSignal']) {
            expect(react).toHaveProperty(name);
        }
    });
});
