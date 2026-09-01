import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { LangsysApp } from './index.js';

/**
 * Why this exists even though the current export cannot fail it.
 *
 * `LangsysApp` is exported by reference, so `this` is always the real receiver
 * and `#private` fields are reachable by construction. A Proxy or a wrapper —
 * the two shapes the siblings shipped, and the shape this repo had until
 * recently — does NOT have that property: a `#private` field read through a
 * forwarding layer throws `TypeError: Cannot read private member`, because
 * private access is keyed on the receiver identity, not on the property path.
 *
 * So this pins the constraint structurally — whether the core uses private
 * fields at all, asserted as a concrete value so it reddens when that changes.
 * A swap from identity export to a Proxy is caught by `surface.test.ts`'s
 * identity assertion, NOT here: with no #private fields in the core today,
 * nothing in this file can throw under a Proxy.
 */
describe('private-field reachability', () => {
    const coreSource = readFileSync('node_modules/langsys-js-typescript/dist/index.js', 'utf8');
    const DECL = /(?:^|[\s;{(])#[A-Za-z_]\w*\s*(?:=|\(|;)/m;
    const ACCESS = /this\.#[A-Za-z_]\w*/;

    it('fixture positive control: the pattern detects a real private field', () => {
        // Without this the scan below is unfalsifiable — a pattern that matches
        // nothing reports "no private fields" for every input.
        const fixture = 'class X { #secret = 1; get v() { return this.#secret; } }';
        expect(DECL.test(fixture)).toBe(true);
        expect(ACCESS.test(fixture)).toBe(true);
    });

    it('fixture negative control: bare # in CSS or a URL is not a private field', () => {
        // The false positive a naive /#\w+/ scan produces. Measured on this
        // core: 2 naive matches, BOTH CSS hex colours (#e0005a, #fff) in a
        // single string — no URL fragment, contrary to an earlier note here.
        // A URL fragment is included below because it is the other shape a
        // naive scan trips on, not because this core contains one.
        const notPrivate = 'const c = "#e0005a"; const d = "#fff"; const u = "https://x.dev/docs#anchor";';
        expect(DECL.test(notPrivate)).toBe(false);
        expect(ACCESS.test(notPrivate)).toBe(false);
    });

    it('records the core\'s CURRENT private-field usage as a concrete value', () => {
        // Asserted, not merely "is a boolean" — an earlier revision asserted
        // typeof === 'boolean', which is true whatever the scan returns and so
        // could not fail. Pinned to today's measured answer instead: if the core
        // adopts #private fields this reddens, which is exactly when the
        // behavioural half below starts mattering.
        expect(DECL.test(coreSource)).toBe(false);
        expect(ACCESS.test(coreSource)).toBe(false);
    });

    it('fixture: a NAIVE Proxy BREAKS private-field access — the control failing', () => {
        // The trap this pin exists for, demonstrated rather than described.
        // Private access is keyed on the receiver identity: reading `#secret`
        // with the Proxy as `this` throws, because the Proxy is not the object
        // the field was installed on.
        class WithPrivate {
            #secret = 42;
            read() { return this.#secret; }
        }
        const real = new WithPrivate();
        expect(real.read()).toBe(42); // positive control: works on the real object

        const naive = new Proxy(real, { get: (t, p) => (t as never)[p] }) as WithPrivate;
        // The naive trap returns an UNBOUND method, so `this` becomes the Proxy.
        const unbound = naive.read;
        expect(() => unbound.call(naive)).toThrow(TypeError);
    });

    it('fixture: a correctly-bound Proxy survives, and identity export cannot fail', () => {
        class WithPrivate {
            #secret = 42;
            read() { return this.#secret; }
        }
        const real = new WithPrivate();

        // Binding to the target fixes it — this is the shape a Proxy MUST use.
        const bound = new Proxy(real, {
            get: (t, p) => {
                const v = (t as unknown as Record<PropertyKey, unknown>)[p];
                return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
            },
        }) as WithPrivate;
        expect(bound.read()).toBe(42);

        // Identity export skips the question entirely: there is no trap, so
        // there is no receiver to get wrong.
        expect(real.read()).toBe(42);
    });

    it('behavioural: a real call through our export reaches core internals', () => {
        // NOTE ON WHAT THIS DOES **NOT** CATCH. While the core has no #private
        // fields, this row passes under `new Proxy(_LangsysApp, {})` too — a
        // swap to a Proxy is caught by `surface.test.ts`'s identity assertion,
        // not here. This row only becomes a Proxy detector once the core adopts
        // private fields, which the scan above pins the moment it happens.
        expect(() => LangsysApp.detectPreferredLocale('en-US,en;q=0.9')).not.toThrow();
        const result = LangsysApp.detectPreferredLocale('en-US,en;q=0.9');
        expect(result === false || typeof result === 'string').toBe(true);
    });
});
