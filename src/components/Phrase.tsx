import { createElement, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
    PHRASE_MARKER_ATTR,
    Phrase as VanillaPhrase,
    currentRequestScope,
    registerBlock,
    renderBlock,
    warnUnrenderedBlock,
    warnUnregistered,
    type BlockNode,
    type ParamPrimitive,
} from 'langsys-js-typescript';
import { hasRuntimeValues, toBlockNodes, toReactNodes, withNodeParams } from '../block-nodes.js';
import { useT } from '../hooks.js';
import { useSeedScopeRunner } from './LangsysProvider.js';
import { BlockCategory, useUnitCategory } from './unit-category.js';

/**
 * Props for the React `Phrase` component. Mirrors the Svelte component's props,
 * with Svelte's `class` renamed to React's idiomatic `className`.
 */
export interface PhraseProps {
    /** Category the phrase registers under (disambiguation for translators). */
    category?: string;
    /**
     * The category this content was registered under before it moved to `category` (MOVE-1):
     * `''` for none, absent for no move. Its translations follow it instead of being made, and
     * charged for, again; until the catalog holds it under `category`, the previous category's
     * entry renders and the host says so (MOVE-4, MOVE-5). Never part of its identity (MOVE-2),
     * and sent only on the registration a miss triggers (MOVE-3), so once the catalog has it the
     * prop does nothing and can be deleted whenever convenient.
     */
    previousCategory?: string | null;
    /**
     * Interpolation params. Write placeholders as `%n%` / `%name%` in the markup.
     * A bare `{n}` in JSX is an expression React evaluates before the SDK sees the
     * text, so the *value* lands in the captured phrase and each distinct value
     * becomes its own phrase to translate. `%n%` yields one stable phrase.
     */
    params?: Record<string, ParamPrimitive>;
    /** Host element tag. Defaults to `<span>`. */
    tag?: string;
    /** Class applied to the host element. */
    className?: string;
    children?: ReactNode;
    /**
     * Set by the build transform when every value of the phrase is marked (it holds a marker of its
     * own) and one in its translated text stands where no marker can (in a translated `<svg>`, or an
     * element that holds text only), so it is left as written: the phrase registers nothing (VAR-7)
     * and renders what the catalog holds.
     */
    'data-ls-unnamed'?: string;
}

/**
 * React wrapper around the vanilla `Phrase` rich-text handler.
 *
 * Use it to keep a markup-bearing run as ONE translatable phrase — e.g. so a
 * count variable stays next to the noun it pluralizes:
 *
 *   <Phrase category="ProductCard" params={{ n: reviewCount }}>
 *     Based on %n% <strong>reviews</strong>
 *   </Phrase>
 *
 * Write placeholders as `%n%` (not bare `{n}`): in JSX a literal `{n}` is a JS
 * expression React evaluates before the SDK sees the text. `%n%` passes through
 * as literal text and the SDK normalizes it to canonical `{n}` at capture.
 *
 * The cost of getting this wrong is not a broken placeholder, it's catalog
 * churn. `<Phrase>` keys on the encoded phrase string, so the substituted value
 * becomes part of the key — a new phrase per distinct value, none reusable,
 * with the base locale rendering correctly throughout. Measured against the
 * shipped `encodeRichText`:
 *
 *   {n} via JSX        "Based on 0 {m0o}reviews{m0c}"   (and 1, 2, … each new)
 *   %n% placeholder    "Based on {n} {m0o}reviews{m0c}" (stable for all values)
 *
 * The inline markup never reaches the translator — it's replaced with neutral
 * tokens and the real elements are reconstituted at render (see richtext.ts in
 * the base SDK). The host carries `data-ls-phrase` so a wrapping `<Translate>`
 * skips it and lets this handler own it.
 *
 * Keep children static (literal markup): the handler takes over the rendered
 * subtree. For values React owns and re-renders, pass them through `params`.
 */
export function Phrase({
    category: named,
    previousCategory: namedPrevious,
    params: given = {},
    tag = 'span',
    className,
    children: content,
    'data-ls-unnamed': unmarked,
}: PhraseProps) {
    // Inside a block that falls back, the block's category and previous category unless this unit
    // names its own (MOVE-4).
    const inherited = useUnitCategory(named, namedPrevious);
    const { category, previousCategory } = inherited;
    // A param that is an element or a list renders in its place, not as text.
    const { children, params } = withNodeParams(content, given ?? {});
    const t = useT(); // changes with the locale, the catalog and a route change (HINT-13)
    const hostRef = useRef<HTMLElement | null>(null);
    const instanceRef = useRef<VanillaPhrase>(undefined);
    const mapped = toBlockNodes(children);
    // The phrase host itself is the unit: the core renders it as one rich phrase, whose inline
    // elements a translation may reorder (MARK-4). Its elements' `source` indices count from 1.
    const unit: BlockNode[] | null = mapped.ok
        ? [{ tag, attrs: { [PHRASE_MARKER_ATTR]: '' }, children: mapped.nodes }]
        : null;
    // A value the build transform did not name (it is not enabled, or the value is a conditional)
    // has no name, so the unit registers nothing (VAR-7); what the catalog already holds still
    // renders. One inside a subtree that is not translated is not read: the phrase keys that
    // subtree as one empty pair (TOK-1).
    const unnamedValues = unmarked !== undefined || hasRuntimeValues(children, true);
    const moved = previousCategory === undefined || previousCategory === null ? {} : { previousCategory };
    const options = { category, ...moved, params, ...(unnamedValues ? { register: false } : {}) };
    // Under a <LangsysProvider>, the server and hydration renders read the request's scope.
    const inSeedScope = useSeedScopeRunner();
    const rendered = unit ? inSeedScope(() => renderBlock(unit, options)) : null;
    const scope = currentRequestScope();

    const register = (host?: Element) => {
        if (!unit) return;
        // With a value the transform did not name, `options` carries `register: false`: the call
        // registers nothing and still claims the host.
        if (unnamedValues) warnUnnamed(unmarked !== undefined);
        // `host` claims the element for this component, so an enclosing <Translate> that fell back
        // to the core's DOM class leaves it alone (MARK-2), and lets the core check the phrase's
        // ancestors for a resolved marker (GATE-10), walking from its parent: the phrase element's
        // own marker says it rendered a translation.
        // The promise is left unhandled on purpose, as in <Translate>: it rejects only under
        // `requireCredentials` with no credentials (WIRE-4), and that is how the core surfaces it.
        void registerBlock(unit, { ...options, host });
    };
    if (scope) {
        register();
        if (!mapped.ok) warnUnrenderedBlock(mapped.reason);
    }

    useEffect(() => {
        register(hostRef.current ?? undefined);
        // Registration is one-shot per call: it runs again whenever `t` changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t, category, rendered ? JSON.stringify(unit) : null]);

    // Unmappable content only: the core's DOM class translates it after mount.
    useEffect(() => {
        const host = hostRef.current;
        if (mapped.ok || !host) return;
        if (unnamedValues) warnUnnamed(unmarked !== undefined);
        const instance = new VanillaPhrase(host, {
            category,
            ...moved,
            params,
            ...(unnamedValues ? { register: false } : {}),
        });
        instanceRef.current = instance;
        return () => {
            instance.destroy();
            instanceRef.current = undefined;
        };
        // A new `tag` replaces the host element, so the instance moves to the new one.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapped.ok, category, previousCategory, tag]);

    useEffect(() => {
        instanceRef.current?.setParams(params);
    });

    const host = rendered?.nodes[0];
    if (mapped.ok && host && 'tag' in host) {
        const { class: _class, ...hostAttrs } = host.attrs;
        return createElement(
            tag,
            { ref: hostRef, className, ...hostAttrs },
            ...toReactNodes(host.children, [createElement(tag), ...mapped.elements], [[], ...mapped.nested]),
            ...mapped.portals,
        );
    }
    // A list `withNodeParams` rebuilt from the unit's own children goes back as separate children, as
    // JSX passed them, so React does not check it for keys as it would a list.
    // The units inside it take its category and previous category (MOVE-4).
    return createElement(
        tag,
        { ref: hostRef, className, [PHRASE_MARKER_ATTR]: '' },
        createElement(
            BlockCategory.Provider,
            { value: inherited },
            ...(children !== content && Array.isArray(children) ? children : [children]),
        ),
    );
}

/** The core's once-per-reason debug notice for a unit it did not register (VAR-7). */
function warnUnnamed(unmarked: boolean): void {
    warnUnregistered(
        unmarked
            ? 'a value the build transform left as written in a phrase whose values are all marked: in a translated <svg>, or an element that holds text only'
            : 'a value the build transform did not name: it is not enabled (langsys-js-react/vite, /babel or /next), or the value is a conditional, which it leaves as written',
    );
}

export default Phrase;
