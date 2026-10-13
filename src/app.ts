/**
 * The entry point and its locale store, in a module that imports no React, so the main entry and
 * `langsys-js-react/server` export the same `LangsysApp` and `createLocaleStore`. A server
 * process, a Next Server Component included, initializes the SDK through the server entry
 * without loading React's hooks.
 */
import {
    LangsysApp as _LangsysApp,
    createSignal,
    type Signal,
    type iLangsysInitConfig as iVanillaInitConfig,
    type iLangsysResponse,
} from 'langsys-js-typescript';

/**
 * React-flavored init config. Identical to the base SDK's config except
 * `UserLocaleStore` is typed as a `Signal<string>` — create one with
 * `createLocaleStore()` (or get one from the `useLocaleStore` hook). The base
 * SDK only reads and subscribes to it.
 */
export interface iLangsysInitConfig extends Omit<iVanillaInitConfig, 'UserLocaleStore'> {
    UserLocaleStore: Signal<string>;
}

/**
 * React SDK entry point — the core singleton itself, re-exported **by
 * reference**, with `init` typed to take the React-flavoured config.
 *
 * There is no wrapper and no list of delegated methods, so every public member
 * of the core is reachable here the moment it exists, and identity is
 * preserved: `LangsysApp` here **is** the core's `LangsysApp`. This binding
 * overrides no behaviour, so the only thing it needs to express is a type.
 *
 * Destructuring behaves exactly as on the core. `const { t } = LangsysApp` is
 * safe — `t` is a getter returning a closure. Prototype methods are not:
 * `const { refresh } = LangsysApp` detaches the receiver and the call throws.
 * Call methods on `LangsysApp` itself.
 *
 * The type narrows `init` to require a `Signal<string>` for `UserLocaleStore`.
 * The core accepts the broader `LocaleSource`, which `Signal<string>`
 * satisfies. Because the type is `Omit<typeof _LangsysApp, 'init'> & {…}` —
 * keyof-mapped — it does not expose the core's private members: calling one is
 * a compile error.
 *
 * Pinned by `src/surface.test.ts`.
 */
export const LangsysApp: Omit<typeof _LangsysApp, 'init'> & {
    init(config: iLangsysInitConfig): Promise<iLangsysResponse>;
} = _LangsysApp;

/**
 * Create a reactive `Signal<string>` to hold the user's selected locale — the
 * React analog of Svelte's `writable('en-US')`.
 *
 * Pass the result as `UserLocaleStore` to `LangsysApp.init`, read it reactively
 * with `useSignal(store)` (or use the all-in-one `useLocaleStore` hook), and
 * switch locale with `store.set('fr-FR')`. The base SDK only ever reads and
 * subscribes to it — it never writes.
 *
 * Locale identifiers are canonicalized to BCP 47 by the base SDK (v0.3.0+), so
 * `'en-us'` still works on input — but `currentlyLoadedLocale` always emits the
 * canonical form (`'en-us'` — lowercase, per WIRE-3), so compare against the
 * lowercase form. Verified against the core, not assumed: `canonicalizeLocale`
 * lowercases both subtags, so a consumer testing `=== 'en-US'` never matches.
 */
export function createLocaleStore(initial = 'en-US'): Signal<string> {
    return createSignal<string>(initial);
}
