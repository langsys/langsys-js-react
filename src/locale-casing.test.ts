import { describe, expect, it } from 'vitest';
import { canonicalizeLocale } from 'langsys-js-typescript';
import { createLocaleStore } from './adapters.js';

/**
 * WIRE-3: locale identifiers are lowercase `xx-yy` on the wire AND internally,
 * so `en-US` from a host application's locale store resolves to the same entry
 * as `en-us` rather than fetching twice.
 *
 * These assertions are written against the CORE's observed output, not against
 * this package's prose. That distinction is the point: four of this repo's
 * documentation sites claimed canonicalization produced `'en-US'` and told
 * consumers to compare against it — a comparison that can never match, since
 * the normalizer lowercases. The docs were corrected against these results.
 *
 * Deliberately not importing an expectation from the core: a fixture that
 * recomputes its expected value with the implementation's own helper agrees
 * with the implementation whatever it does. The literals below are the
 * independent verifier.
 */
describe('WIRE-3 — locale canonicalization is lowercase', () => {
    it('lowercases the region subtag', () => {
        expect(canonicalizeLocale('en-US')).toBe('en-us');
        expect(canonicalizeLocale('es-ES')).toBe('es-es');
        expect(canonicalizeLocale('fr-FR')).toBe('fr-fr');
    });

    it('lowercases the language subtag too', () => {
        expect(canonicalizeLocale('EN-US')).toBe('en-us');
    });

    it('is idempotent on already-canonical input', () => {
        expect(canonicalizeLocale('en-us')).toBe('en-us');
        expect(canonicalizeLocale('es-cr')).toBe('es-cr');
    });

    it('preserves a bare language tag and multi-subtag forms, lowercased', () => {
        expect(canonicalizeLocale('en')).toBe('en');
        expect(canonicalizeLocale('zh-Hant-TW')).toBe('zh-hant-tw');
    });

    it('never returns the uppercase-region form WIRE-3 forbids on the wire', () => {
        for (const input of ['en-US', 'en-us', 'EN-US', 'En-Us']) {
            expect(canonicalizeLocale(input)).not.toMatch(/[A-Z]/);
        }
    });

    it('the locale store passes values through verbatim — canonicalization is the core\'s job', () => {
        // BIND-1: a binding adapts shape and timing, never meaning. The store
        // must not pre-normalize, or it would be encoding a core decision.
        const store = createLocaleStore('en-US');
        expect(store.get()).toBe('en-US');
    });
});
