import { createElement, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
    PHRASE_MARKER_ATTR,
    Phrase as VanillaPhrase,
    currentRequestScope,
    registerBlock,
    renderBlock,
    warnUnrenderedBlock,
    type BlockNode,
    type ParamPrimitive,
} from 'langsys-js-typescript';
import { toBlockNodes, toReactNodes } from '../block-nodes.js';
import { useT } from '../hooks.js';
import { UnderDomWalk } from './dom-walk.js';

/**
 * Props for the React `Phrase` component. Mirrors the Svelte component's props,
 * with Svelte's `class` renamed to React's idiomatic `className`.
 */
export interface PhraseProps {
    /** Category the phrase registers under (disambiguation for translators). */
    category?: string;
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
export function Phrase({ category = '', params = {}, tag = 'span', className, children }: PhraseProps) {
    const t = useT(); // changes with the locale, the catalog and a route change (HINT-13)
    const hostRef = useRef<HTMLElement | null>(null);
    const instanceRef = useRef<VanillaPhrase>(undefined);
    const underDomWalk = useContext(UnderDomWalk);
    const mapped = toBlockNodes(children);
    // The phrase host itself is the unit: the core renders it as one rich phrase, whose inline
    // elements a translation may reorder (MARK-4). Its elements' `source` indices count from 1.
    const unit: BlockNode[] | null = mapped.ok
        ? [{ tag, attrs: { [PHRASE_MARKER_ATTR]: '' }, children: mapped.nodes }]
        : null;
    const options = { category, params };
    const rendered = unit ? renderBlock(unit, options) : null;
    const scope = currentRequestScope();

    const register = (host?: Element) => {
        if (!unit || underDomWalk) return;
        // `host` lets the core check the phrase's ancestors for a resolved marker (GATE-10),
        // walking from its parent: the phrase element's own marker says it rendered a translation.
        registerBlock(unit, { ...options, host });
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
        const instance = new VanillaPhrase(host, { category, params });
        instanceRef.current = instance;
        return () => {
            instance.destroy();
            instanceRef.current = undefined;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapped.ok, category]);

    useEffect(() => {
        instanceRef.current?.setParams(params);
    });

    const host = rendered?.nodes[0];
    if (mapped.ok && host && 'tag' in host) {
        const { class: _class, ...hostAttrs } = host.attrs;
        return createElement(
            tag,
            { ref: hostRef, className, ...hostAttrs },
            ...toReactNodes(host.children, [createElement(tag), ...mapped.elements]),
            ...mapped.portals,
        );
    }
    return createElement(tag, { ref: hostRef, className, [PHRASE_MARKER_ATTR]: '' }, children);
}

export default Phrase;
