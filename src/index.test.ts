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
        const store = createLocaleStore('en-us');
        expect(store.get()).toBe('en-us');

        const seen: string[] = [];
        const unsub = store.subscribe((v) => seen.push(v));
        expect(seen).toEqual(['en-us']); // subscribe fires immediately with the current value

        store.set('fr-fr');
        expect(store.get()).toBe('fr-fr');
        expect(seen).toEqual(['en-us', 'fr-fr']);

        unsub();
        store.set('de-de');
        expect(store.get()).toBe('de-de');
        expect(seen).toEqual(['en-us', 'fr-fr']); // no notifications after unsubscribe
    });

    it('defaults to en-us', () => {
        expect(createLocaleStore().get()).toBe('en-us');
    });
});
