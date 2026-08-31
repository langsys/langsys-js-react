import { describe, expect, it } from 'vitest';
import { createLocaleStore } from './adapters.js';

/**
 * Smoke coverage for the locale-store adapter — the one piece of runtime glue
 * this package adds on the input side. The reactive read path (`useSignal` →
 * `useSyncExternalStore`) is exercised by the playground in `example/`; here we
 * assert the framework-agnostic store contract the SDK depends on.
 */
describe('createLocaleStore', () => {
    it('seeds, reads, updates, and notifies subscribers', () => {
        const store = createLocaleStore('en-US');
        expect(store.get()).toBe('en-US');

        const seen: string[] = [];
        const unsub = store.subscribe((v) => seen.push(v));
        expect(seen).toEqual(['en-US']); // subscribe fires immediately with the current value

        store.set('fr-FR');
        expect(store.get()).toBe('fr-FR');
        expect(seen).toEqual(['en-US', 'fr-FR']);

        unsub();
        store.set('de-DE');
        expect(store.get()).toBe('de-DE');
        expect(seen).toEqual(['en-US', 'fr-FR']); // no notifications after unsubscribe
    });

    it('defaults to en-US', () => {
        expect(createLocaleStore().get()).toBe('en-US');
    });

    it('passes values through verbatim — canonicalization is the base SDK\'s job', () => {
        // The store is a plain Signal; lowercase input is legal and reaches the
        // SDK as-is, where the core canonicalizes it to lowercase ('en-US' → 'en-us').
        const store = createLocaleStore('en-us');
        expect(store.get()).toBe('en-us');
    });
});
