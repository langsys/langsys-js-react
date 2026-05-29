import { createElement, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Translate as VanillaTranslate } from 'langsys-js-typescript';

/**
 * Props for the React `Translate` component. Mirrors the Svelte component's
 * props 1:1, with Svelte's `class` renamed to React's idiomatic `className`.
 */
export interface TranslateProps {
    /** Optional category under which tokens are registered. Helps translators disambiguate. */
    category?: string;
    /** Optional stable id for the content block. If omitted, the SDK hashes category + tokens. */
    custom_id?: string;
    /** Optional human-readable label shown in the Translation Manager. */
    label?: string;
    /** Host element tag. Defaults to a `<translate>` custom element. */
    tag?: string;
    /** Class applied to the host element. */
    className?: string;
    children?: ReactNode;
}

/**
 * React wrapper around the vanilla `Translate` DOM class from
 * `langsys-js-typescript`. It renders a host element, then on mount lets the
 * vanilla class walk and tokenize the rendered children (text nodes plus
 * translatable attributes), register the content block, and re-translate on
 * locale change. On unmount it tears the instance down.
 *
 * This is the React analog of the Svelte `<Translate>` component — pure
 * mount/destroy glue. The DOM walking, content-block registration, attribute
 * harvesting, and re-translation lifecycle all live in the base SDK.
 *
 * Like the Svelte component, this lets the SDK mutate the rendered DOM in place,
 * so keep the children static: prose, marketing copy, CMS-rendered HTML — the
 * content-block use case. For dynamic per-string values that React owns and
 * re-renders, use `useT()` instead.
 */
export function Translate({
    category = '',
    custom_id = '',
    label = '',
    tag = 'translate',
    className,
    children,
}: TranslateProps) {
    const hostRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const instance = new VanillaTranslate(host, { category, custom_id, label });
        return () => instance.destroy();
    }, [category, custom_id, label]);

    return createElement(tag, { ref: hostRef, className }, children);
}

export default Translate;
