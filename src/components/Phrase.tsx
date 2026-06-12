import { createElement, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Phrase as VanillaPhrase } from 'langsys-js-typescript';

/**
 * Props for the React `Phrase` component. Mirrors the Svelte component's props,
 * with Svelte's `class` renamed to React's idiomatic `className`.
 */
export interface PhraseProps {
    /** Category the phrase registers under (disambiguation for translators). */
    category?: string;
    /** Interpolation params — `{n}` for pluralization, `{name}`, etc. */
    params?: Record<string, unknown>;
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
 *     Based on {'{n}'} <strong>reviews</strong>
 *   </Phrase>
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
    const hostRef = useRef<HTMLElement | null>(null);
    const instanceRef = useRef<VanillaPhrase>(undefined);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const instance = new VanillaPhrase(host, { category, params });
        instanceRef.current = instance;
        return () => {
            instance.destroy();
            instanceRef.current = undefined;
        };
        // Recreate only when the category changes; param changes flow through setParams below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category]);

    // Re-render on a changed count/param after mount.
    useEffect(() => {
        instanceRef.current?.setParams(params);
    });

    return createElement(tag, { ref: hostRef, className, 'data-ls-phrase': '' }, children);
}

export default Phrase;
