import { createElement } from 'react';
import type { ReactNode } from 'react';

/**
 * Props for the React `DontTranslate` component. Mirrors the Svelte component,
 * with Svelte's `class` renamed to React's idiomatic `className`.
 */
export interface DontTranslateProps {
    /** Host element tag. Defaults to `<span>`. */
    tag?: string;
    /** Class applied to the host element. */
    className?: string;
    children?: ReactNode;
}

/**
 * Marks a region as never-translated, preserved verbatim:
 *
 *   Built with <DontTranslate>Kangen®</DontTranslate> on{' '}
 *   <DontTranslate>langsys.dev</DontTranslate>
 *
 * The host carries the standard `translate="no"` attribute, which both the
 * tokenizer and the renderer in the base SDK already honor — so its content is
 * never tokenized, registered, or replaced. Pure presentational glue; no
 * vanilla handler needed.
 *
 * `data-ls-dont-translate` is a **wrapper-level hook only** — a styling and
 * debugging handle. The base SDK has never matched on it (verified against
 * every published version from 0.1.0 to 0.6.2); exclusion rests entirely on
 * `translate="no"`. Don't remove it — consumers may select on it — but don't
 * describe it as SDK-honored either. The SDK's exclusion set is
 * `translate="no"` (case-insensitive) and PHP's `data-notrans` alias.
 */
export function DontTranslate({ tag = 'span', className, children }: DontTranslateProps) {
    return createElement(
        tag,
        { translate: 'no', 'data-ls-dont-translate': '', className },
        children,
    );
}

export default DontTranslate;
