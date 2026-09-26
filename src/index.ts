/**
 * langsys-js-react — idiomatic React binding over `langsys-js-typescript`.
 *
 * Public API:
 *   - `LangsysApp` — the core singleton by reference, with `init` typed to
 *     accept a `Signal<string>` (make one with `createLocaleStore`).
 *   - Hooks — `useT`, `useCurrentLocale`, `useTranslations`, `useLocaleStore`,
 *     `useWriteEnabled`, `useNotifyNavigation`, `useRenderServerMessage`, and the low-level `useSignal`. These are the reactive layer; in components
 *     prefer them over the raw signals.
 *   - `createLocaleStore` — make the user-locale store (React analog of Svelte's
 *     `writable`).
 *   - `Translate` — React component wrapping the vanilla DOM `Translate` class.
 *   - Raw signals `t` / `currentlyLoadedLocale` / `sTranslations` — re-exported
 *     for advanced/direct subscription outside React's render cycle.
 */

import {
    LangsysApp as _LangsysApp,
    type CatalogSnapshot,
    type ExtractParamKeys,
    type LegacyKeyFile,
    type ParamPrimitive,
    type ParamsFor,
    type ResolveServerMessagesOptions,
    type ServerMessage,
    type ServerMessagePieces,
    type Signal,
    type TArgs,
    type TFunction,
    type TranslationParams,
    type WriteGrant,
    type iCategories,
    type iContentBlock,
    type iCountry,
    type iCountryDialCode,
    type iCountryList,
    type iCurrency,
    type iCurrencyList,
    type iLangsysInitConfig as iVanillaInitConfig,
    type iLangsysResponse,
    type iLanguageName,
    type iLocaleData,
    type iLocaleDefault,
    type iLocaleFlat,
    type iProject,
    type iTranslations,
} from 'langsys-js-typescript';

// Reactive primitives (raw signals) — re-exported for advanced/direct
// subscription. `tSignal` is exposed under the friendlier name `t`. In
// components, prefer the hooks (`useT`, `useCurrentLocale`, …).
export { currentlyLoadedLocale, createSignal, sTranslations, tSignal as t } from 'langsys-js-typescript';

// `writeEnabled` is deliberately NOT re-exported by reference. Do not add it.
//
// The three signals above CAN hold a value during a server render — the core's
// synchronous `seedCatalog()` puts a catalog in place before rendering — so
// reading them raw is a legitimate advanced use. (Not "safe" without caveat:
// they are process-global, so concurrent requests in different locales share
// them — spec SRV-2, recorded not implemented in CONFORMANCE.md.)
// `writeEnabled` differs in kind, not degree — it is browser-authoritative and
// *defined* as `undefined` for the whole of a server render, so no seed exists.
// `useWriteEnabled()` exists to adapt exactly that, pinning `getServerSnapshot` so the server can never emit
// capability-dependent markup. Re-exporting the raw signal alongside the adapted
// one would hand callers a supported-looking way to defeat the pin while
// implying the two are interchangeable.
//
// BIND-6 mandates re-exporting by reference everything that does NOT need
// adapting; this signal is the one that does, so the mandate excludes it.
// The capability is not withheld — `langsys-js-typescript` is a regular
// dependency of this package, installed transitively, and an advanced consumer can import the raw signal from the core directly, on
// their own judgement. This binding simply declines to bless that path under its
// own name. Absence is pinned by `src/write-enabled-surface.test.ts`.

// Write grant — supply a short-lived token after `init()` (e.g. once the user
// logs in) so the server re-evaluates the session as write-enabled. Standalone
// alias for `LangsysApp.setWriteGrant`; both re-authorize and resolve when the
// server has answered.
export { setWriteGrant } from 'langsys-js-typescript';

// Route change — re-exported by reference. Call it from your router's after-navigation hook,
// or use the `useNotifyNavigation` hook, so content that stays mounted across routes is
// credited to the new page (spec HINT-13).
export { notifyNavigation } from 'langsys-js-typescript';

// Server messages — re-exported by reference. `resolveServerMessages` reads the entries from
// where the server attached them (a configured `key`, or an app `resolver`) in a response body or
// an Inertia page's props; `renderServerMessage` renders one (spec MSG-1, MSG-5).
// In components, `useRenderServerMessage` re-renders them when the locale changes.
export {
    DEFAULT_SERVER_MESSAGE_CATEGORY,
    renderServerMessage,
    resolveServerMessages,
} from 'langsys-js-typescript';

// Legacy-key migration — the mode itself is the `legacyKeys` init option (inherited from the
// core's config) or `LangsysApp.Translations.setLegacyKeys`; `t()` / `useT()` pass through it unchanged.
// The error class is re-exported so an app can catch an unreadable file by type (spec MIG-7).
export { LegacyFormatError } from 'langsys-js-typescript';

// Catalog snapshots — load one with `LangsysApp.loadSnapshot(snapshot, locale?)` before the first
// render. The error class is re-exported so an app can catch a refused file by type; its
// `reason` names why (spec SNAP-2, SNAP-3).
export { SnapshotError } from 'langsys-js-typescript';

// Locale canonicalization (BCP 47) — the SDK canonicalizes all locale input
// (v0.3.0+); re-exported so consumers can normalize their own values the same
// way before comparing against `useCurrentLocale()` / `detectPreferredLocale()`.
export { canonicalizeLocale } from 'langsys-js-typescript';

// API client (vanilla — no React concerns)
export { LangsysAppAPI } from 'langsys-js-typescript';

// Hooks + adapters (the React-idiomatic reactive layer)
export { createLocaleStore, useSignal } from './adapters.js';
export {
    useCurrentLocale,
    useLocaleStore,
    useNotifyNavigation,
    useRenderServerMessage,
    useT,
    useTranslations,
    useWriteEnabled,
} from './hooks.js';

// Components
export { Translate, type TranslateProps } from './components/Translate.js';
export { Phrase, type PhraseProps } from './components/Phrase.js';
export { DontTranslate, type DontTranslateProps } from './components/DontTranslate.js';

// Type re-exports — these are framework-agnostic, so consumers can rely on them
// directly without reaching into `langsys-js-typescript`.
export type {
    CatalogSnapshot,
    ExtractParamKeys,
    LegacyKeyFile,
    ParamPrimitive,
    ParamsFor,
    ResolveServerMessagesOptions,
    ServerMessage,
    ServerMessagePieces,
    Signal,
    TArgs,
    TFunction,
    TranslationParams,
    WriteGrant,
    iCategories,
    iContentBlock,
    iCountry,
    iCountryDialCode,
    iCountryList,
    iCurrency,
    iCurrencyList,
    iLangsysResponse,
    iLanguageName,
    iLocaleData,
    iLocaleDefault,
    iLocaleFlat,
    iProject,
    iTranslations,
};

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
