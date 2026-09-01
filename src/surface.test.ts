import { describe, expect, it } from 'vitest';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { LangsysApp as core } from 'langsys-js-typescript';
import { LangsysApp } from './index.js';

/**
 * Pins the binding's entry point against the core's PUBLIC surface, generated
 * at test time rather than from a list maintained here — a hand-written
 * expectation would reproduce in the verifier the defect it exists to catch.
 *
 * PUBLIC is decided by the `.d.ts`, not by the runtime chain. TypeScript's
 * `private` is erased at runtime, so walking the prototype chain alone reports
 * implementation detail as API. An earlier revision of this file did exactly
 * that and concluded the previous wrapper had dropped five methods; all five
 * were `private` in the core's `.d.ts` and were never reachable by any
 * consumer. The wrapper dropped **zero** public members. See CONFORMANCE.md.
 *
 * What the identity export actually buys is not recovered methods — it is that
 * no future public member can be missed, and that identity is preserved.
 */

const require = createRequire(import.meta.url);

/** Every member reachable on an object's chain — methods, getters and data. */
function surfaceOf(target: object): string[] {
    const out = new Set<string>();
    let o: object | null = target;
    while (o && o !== Object.prototype) {
        for (const k of Object.getOwnPropertyNames(o)) {
            if (k === 'constructor' || k.startsWith('_')) continue;
            out.add(k);
        }
        o = Object.getPrototypeOf(o);
    }
    return [...out].sort();
}

describe('LangsysApp surface', () => {
    const coreSurface = surfaceOf(core);
    const dtsPath = realpathSync(require.resolve('langsys-js-typescript')).replace(/\.js$/, '.d.ts');
    const privateNames = new Set(
        [...readFileSync(dtsPath, 'utf8').matchAll(/^\s*private\s+([A-Za-z_]\w*)\s*;/gm)].map((m) => m[1]),
    );
    const publicSurface = coreSurface.filter((m) => !privateNames.has(m));

    it('positive control: the core exposes a substantial surface', () => {
        // Guards the generator itself. If this drops to a handful, `surfaceOf`
        // has stopped walking the chain and every reachability row below would
        // pass vacuously.
        expect(publicSurface.length).toBeGreaterThan(10);
        expect(publicSurface).toContain('init');
        expect(publicSurface).toContain('t');
    });

    it('positive control: the .d.ts classification actually excludes something', () => {
        // If nothing is classified private, `publicSurface` is just the runtime
        // walk and the rows below prove less than they appear to.
        expect(privateNames.size).toBeGreaterThan(0);
        expect(privateNames.has('resolveLocale')).toBe(true); // known private
        expect(privateNames.has('getCountries')).toBe(false); // known public
    });

    it('every PUBLIC core member is reachable through the binding', () => {
        const missing = publicSurface.filter(
            (m) => (LangsysApp as unknown as Record<string, unknown>)[m] === undefined,
        );
        expect(missing).toEqual([]);
    });

    it('is the core singleton by reference, so identity and `this` are preserved', () => {
        // The strongest form of the guarantee: not "forwards correctly" but
        // "is the same object", which cannot drift.
        expect(LangsysApp).toBe(core);
    });

    it('members are identical references, not re-wrapped', () => {
        for (const m of publicSurface) {
            const a = (LangsysApp as unknown as Record<string, unknown>)[m];
            const b = (core as unknown as Record<string, unknown>)[m];
            expect(a).toBe(b);
        }
    });

    it('survives destructuring — forwarding is unbound', () => {
        // A Proxy or wrapper that binds `this` at property access breaks here.
        // Identity export cannot, and this pins that it stays that way.
        const { detectPreferredLocale } = LangsysApp;
        expect(typeof detectPreferredLocale).toBe('function');
        expect(detectPreferredLocale).toBe(core.detectPreferredLocale);
    });
});
