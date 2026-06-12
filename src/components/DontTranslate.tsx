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
 */
export function DontTranslate({ tag = 'span', className, children }: DontTranslateProps) {
    return createElement(
        tag,
        { translate: 'no', 'data-ls-dont-translate': '', className },
        children,
    );
}

export default DontTranslate;
