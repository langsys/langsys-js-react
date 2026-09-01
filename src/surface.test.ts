import { describe, expect, it } from 'vitest';
import { LangsysApp as core } from 'langsys-js-typescript';
import { LangsysApp } from './index.js';

/**
 * Pins the binding's entry point against the core's, generated from the core
 * rather than from a list maintained here.
 *
 * A hand-written wrapper listing each core method shipped five unreachable
 * methods in 0.6.7 — `applyAuthorization`, `findBestLocaleMatch`,
 * `getUserLanguagePreferences`, `parseAcceptLanguageHeader`, `resolveLocale`.
 * Nothing caught it because nothing compared the two surfaces; a list that has
 * fallen behind still typechecks and still passes every test written against
 * the members it does have.
 *
 * So the reachability assertion below is DERIVED from the core's own member
 * list at test time. A test enumerating the expected members by hand would
 * reproduce the original defect in the verifier.
 */

/** Every non-private callable/getter member reachable on an object's chain. */
function surfaceOf(target: object): string[] {
    const out = new Set<string>();
    let o: object | null = target;
    while (o && o !== Object.prototype) {
        for (const k of Object.getOwnPropertyNames(o)) {
            if (k === 'constructor' || k.startsWith('_')) continue;
            const d = Object.getOwnPropertyDescriptor(o, k);
            if (d && (typeof d.value === 'function' || d.get)) out.add(k);
        }
        o = Object.getPrototypeOf(o);
    }
    return [...out].sort();
}

describe('LangsysApp surface', () => {
    const coreSurface = surfaceOf(core);

    it('positive control: the core exposes a substantial surface', () => {
        // Guards the generator itself. If this drops to a handful, `surfaceOf`
        // has stopped walking the chain and every reachability row below would
        // pass vacuously.
        expect(coreSurface.length).toBeGreaterThan(10);
        expect(coreSurface).toContain('init');
        expect(coreSurface).toContain('t');
    });

    it.each(['applyAuthorization', 'findBestLocaleMatch', 'getUserLanguagePreferences', 'parseAcceptLanguageHeader', 'resolveLocale'])(
        'regression: %s is reachable (one of the five lost in 0.6.7)',
        (name) => {
            expect(typeof (LangsysApp as unknown as Record<string, unknown>)[name]).toBe('function');
        },
    );

    it('every core member is reachable through the binding', () => {
        const missing = coreSurface.filter(
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
        for (const m of coreSurface) {
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
