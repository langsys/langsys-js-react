/**
 * langsys-js-react — idiomatic React binding over `langsys-js-typescript`.
 *
 * Public API:
 *   - `LangsysApp` — `init` accepts a `Signal<string>` (make one with
 *     `createLocaleStore`) for the user locale; every other method delegates.
 *   - Hooks — `useT`, `useCurrentLocale`, `useTranslations`, `useLocaleStore`,
 *     and the low-level `useSignal`. These are the reactive layer; in components
 *     prefer them over the raw signals.
 *   - `createLocaleStore` — make the user-locale store (React analog of Svelte's
 *     `writable`).
 *   - `Translate` — React component wrapping the vanilla DOM `Translate` class.
 *   - Raw signals `t` / `currentlyLoadedLocale` / `sTranslations` — re-exported
 *     for advanced/direct subscription outside React's render cycle.
 */

import {
    LangsysApp as _LangsysApp,
    type ExtractParamKeys,
    type ParamPrimitive,
    type ParamsFor,
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
// The three signals above are SSR-safe: `initialTranslations` seeds them before
// the server render, so reading them raw is legitimate advanced use.
// `writeEnabled` is the opposite — it is browser-authoritative and *defined* as
// `undefined` for the whole of a server render. `useWriteEnabled()` exists to
// adapt exactly that, pinning `getServerSnapshot` so the server can never emit
// capability-dependent markup. Re-exporting the raw signal alongside the adapted
// one would hand callers a supported-looking way to defeat the pin while
// implying the two are interchangeable.
//
// BIND-6 mandates re-exporting by reference everything that does NOT need
// adapting; this signal is the one that does, so the mandate excludes it.
// The capability is not withheld — `langsys-js-typescript` is a peer dependency
// and an advanced consumer can import the raw signal from the core directly, on
// their own judgement. This binding simply declines to bless that path under its
// own name. Absence is pinned by `src/write-enabled-surface.test.ts`.

// Write grant — supply a short-lived token after `init()` (e.g. once the user
// logs in) so the server re-evaluates the session as write-enabled. Standalone
// alias for `LangsysApp.setWriteGrant`; both re-authorize and resolve when the
// server has answered.
export { setWriteGrant } from 'langsys-js-typescript';

// Locale canonicalization (BCP 47) — the SDK canonicalizes all locale input
// (v0.3.0+); re-exported so consumers can normalize their own values the same
// way before comparing against `useCurrentLocale()` / `detectPreferredLocale()`.
export { canonicalizeLocale } from 'langsys-js-typescript';

// API client (vanilla — no React concerns)
export { LangsysAppAPI } from 'langsys-js-typescript';

// Hooks + adapters (the React-idiomatic reactive layer)
export { createLocaleStore, useSignal } from './adapters.js';
export { useCurrentLocale, useLocaleStore, useT, useTranslations, useWriteEnabled } from './hooks.js';

// Components
export { Translate, type TranslateProps } from './components/Translate.js';
export { Phrase, type PhraseProps } from './components/Phrase.js';
export { DontTranslate, type DontTranslateProps } from './components/DontTranslate.js';

// Type re-exports — these are framework-agnostic, so consumers can rely on them
// directly without reaching into `langsys-js-typescript`.
export type {
    ExtractParamKeys,
    ParamPrimitive,
    ParamsFor,
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
 * reference**, with `init` narrowed to the React-flavoured config.
 *
 * This deliberately is NOT a wrapper class. The previous implementation listed
 * each core method and delegated it, which meant any method nobody remembered
 * to add was unreachable through this binding while existing on the core —
 * silently, with a green typecheck and a green suite, because nothing compares
 * the two surfaces. Five methods were lost that way and shipped in 0.6.7:
 * `applyAuthorization`, `findBestLocaleMatch`, `getUserLanguagePreferences`,
 * `parseAcceptLanguageHeader` and `resolveLocale`. Vue and Solid independently
 * lost the same five to the same shape.
 *
 * Exporting the singleton itself removes the failure mode rather than patching
 * it: there is no list to fall out of date, so a method added to the core is
 * reachable here the moment it exists. That is only sound because this binding
 * overrides no *behaviour* — every member of the old class was a straight
 * delegation — so the sole thing that needed expressing was a type.
 *
 * The type narrows `init` to require a `Signal<string>` for `UserLocaleStore`.
 * The core accepts the broader `LocaleSource`, which `Signal<string>` satisfies,
 * so this is a narrowing for React callers and not a divergence. Identity is
 * preserved: `LangsysApp` here **is** the core's `LangsysApp`, so `this` binds
 * correctly and there is no forwarding layer to get wrong.
 *
 * Pinned by `src/surface.test.ts`.
 */
export const LangsysApp: Omit<typeof _LangsysApp, 'init'> & {
    init(config: iLangsysInitConfig): Promise<iLangsysResponse>;
} = _LangsysApp;
