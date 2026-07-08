import { createElement, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Translate as VanillaTranslate, type ParamPrimitive } from 'langsys-js-typescript';

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
    /**
     * Interpolation params applied to the resolved text (single-brace `{key}`,
     * same syntax as `t()`). Applied to content-block text nodes, translatable
     * attributes, `<option>` text, and single-token content — including
     * untranslated fallbacks. Number/Date values get CLDR locale formatting.
     */
    params?: Record<string, ParamPrimitive>;
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
    params,
    tag = 'translate',
    className,
    children,
}: TranslateProps) {
    const hostRef = useRef<HTMLElement | null>(null);
    const instanceRef = useRef<VanillaTranslate>(undefined);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const instance = new VanillaTranslate(host, { category, custom_id, label, params });
        instanceRef.current = instance;
        return () => {
            instance.destroy();
            instanceRef.current = undefined;
        };
        // Recreate only when the identity props change; param changes flow through setParams below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [category, custom_id, label]);

    // Re-render on changed params after mount, mirroring <Phrase>.
    useEffect(() => {
        instanceRef.current?.setParams(params);
    });

    return createElement(tag, { ref: hostRef, className }, children);
}

export default Translate;
