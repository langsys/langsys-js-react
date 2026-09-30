import { createElement, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
    CONTENT_BLOCK_MARKER_ATTR,
    Translate as VanillaTranslate,
    currentRequestScope,
    registerBlock,
    renderBlock,
    warnUnrenderedBlock,
    warnUnregistered,
    type BlockOptions,
    type ParamPrimitive,
} from 'langsys-js-typescript';
import { hasRuntimeValues, toBlockNodes, toReactNodes } from '../block-nodes.js';
import { useT } from '../hooks.js';
import { UnderDomWalk } from './dom-walk.js';

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
     * Interpolation params. Write placeholders as `%key%` in the markup (a bare
     * `{key}` in JSX is a JS expression; the SDK normalizes `%key%` to canonical
     * `{key}` at capture). Applied to content-block text nodes, translatable
     * attributes, `<option>` text, and single-token content — including
     * untranslated fallbacks. Number/Date values get CLDR locale formatting.
     *
     * A bare `{key}` doesn't just break interpolation — JSX evaluates it before
     * the walker runs, so the *value* is captured as part of the phrase and each
     * distinct value hashes to its own content block. A `<Translate>` around a
     * live counter registers a new block per tick while rendering correctly in
     * the base locale the whole time. `%key%` yields one stable id for all
     * values.
     */
    params?: Record<string, ParamPrimitive>;
    /** Host element tag. Defaults to a `<translate>` custom element. */
    tag?: string;
    /** Class applied to the host element. */
    className?: string;
    children?: ReactNode;
}

/**
 * Translates a block of static content: prose, markup, CMS copy.
 *
 * Content made of host elements, text and numbers renders through the core's `renderBlock`: the
 * translated tree, the block's id and its markers come back as data, and this component renders
 * them as React elements — the originals, cloned with their handlers, refs and keys, in the
 * places the translation puts them. The same call runs on a server (inside a request scope) and
 * in the browser (over the seeded catalog), so the first client render matches the server's HTML,
 * and a locale change re-renders it. Registration goes through the core's `registerBlock`; no DOM
 * class ever walks text nodes React owns.
 *
 * Content whose DOM is unknown until React renders it — a component, `lazy`, `Suspense`, or
 * `dangerouslySetInnerHTML` — is rendered as it is, with an explicit `custom_id` stamped, and the
 * core's DOM `Translate` class translates it after mount. On a server the core warns once per
 * reason that such a block was served as source.
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
    const t = useT(); // changes with the locale, the catalog and a route change (HINT-13)
    const hostRef = useRef<HTMLElement | null>(null);
    const instanceRef = useRef<VanillaTranslate>(undefined);
    const mapped = toBlockNodes(children);
    // `id` is the app's own id for the block: rendered and registered under it (MARK-1).
    // A value interpolated without the build transform cannot be named, so the unit registers
    // nothing (VAR-7); what the catalog already holds still renders.
    const unnamedValues = hasRuntimeValues(children);
    const options: BlockOptions = {
        category,
        params,
        label,
        ...(custom_id ? { id: custom_id } : {}),
        ...(unnamedValues ? { register: false } : {}),
    };
    const rendered = mapped.ok ? renderBlock(mapped.nodes, options) : null;
    const scope = currentRequestScope();
    const underDomWalk = useContext(UnderDomWalk);

    const register = (host?: Element) => {
        if (!mapped.ok || !rendered || rendered.shape === 'empty' || underDomWalk) return;
        if (unnamedValues) return warnUnnamed();
        // `host` lets the core check the block's ancestors for a resolved marker (GATE-10).
        registerBlock(mapped.nodes, { ...options, host });
    };
    if (scope) {
        // A server render: the scope holds the registration for close().
        register();
        if (!mapped.ok) warnUnrenderedBlock(mapped.reason);
    }

    const blockKey = rendered ? `${category}\u0000${custom_id}\u0000${rendered.customId}` : null;
    useEffect(() => {
        register(hostRef.current ?? undefined);
        // Registration is one-shot per call: it runs again whenever `t` changes (a locale, a
        // catalog or a route change) or the block's identity does.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t, blockKey]);

    // Unmappable content only: the core's DOM class walks and translates it after mount.
    useEffect(() => {
        const host = hostRef.current;
        if (mapped.ok || !host) return;
        if (unnamedValues) warnUnnamed();
        const instance = new VanillaTranslate(host, {
            category,
            custom_id,
            label,
            params,
            ...(unnamedValues ? { register: false } : {}),
        });
        instanceRef.current = instance;
        return () => {
            instance.destroy();
            instanceRef.current = undefined;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapped.ok, category, custom_id, label]);

    useEffect(() => {
        instanceRef.current?.setParams(params);
    });

    if (mapped.ok && rendered) {
        return createElement(
            tag,
            { ref: hostRef, className, ...rendered.hostAttrs },
            ...toReactNodes(rendered.nodes, mapped.elements),
            ...mapped.portals,
        );
    }
    // An explicit `custom_id` is the block's identity as the app gave it, so the host carries it
    // from the first render — on a server too (spec MARK-1).
    return createElement(
        tag,
        { ref: hostRef, className, ...(custom_id ? { [CONTENT_BLOCK_MARKER_ATTR]: custom_id } : {}) },
        createElement(UnderDomWalk.Provider, { value: true }, children),
    );
}

/** The core's once-per-reason debug notice for a unit it did not register (VAR-7). */
function warnUnnamed(): void {
    warnUnregistered('a value interpolated without the build transform (langsys-js-react/vite, /babel or /next)');
}

export default Translate;
