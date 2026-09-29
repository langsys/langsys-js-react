/**
 * React children to the core's `BlockNode[]`, for rendering `<Translate>` / `<Phrase>` content
 * through the core's non-DOM block path.
 *
 * What is mapped is exactly what the client's DOM walk would see: host elements with their
 * attributes, strings and numbers. Fragments, arrays and conditional `null` / `false` flatten
 * away, as they do in the DOM. A portal renders outside the host on both sides, so it is kept
 * for rendering but excluded from the nodes. A child whose DOM is unknown until React renders
 * it — a function or class component, a provider, `lazy`, `Suspense` — or whose content is an
 * HTML string (`dangerouslySetInnerHTML`) makes the block unmappable: it is not server-rendered,
 * and its source is served as it is (fleet rule).
 *
 * `elements[i]` is the React element that the `i`th element node of `nodes`, counted in document
 * order, came from. That is what the core's `source` back-reference on a translated element
 * holds: the binding clones that element, with its handlers, refs and key, into the translated
 * position, which a translation may have moved.
 */
import { Children, Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode, type ReactPortal } from 'react';
import type { BlockNode, RenderedNode } from 'langsys-js-typescript';

export type Mapped =
    | { ok: true; nodes: BlockNode[]; elements: ReactElement[]; portals: ReactPortal[] }
    | { ok: false; reason: string };

const PORTAL = Symbol.for('react.portal');

/** React prop names to DOM attribute names, for the props that differ. */
const PROP_TO_ATTR: Record<string, string> = { className: 'class', htmlFor: 'for' };

function attrsOf(props: Record<string, unknown>): Record<string, string> | undefined {
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(props)) {
        if (name === 'children' || name === 'key' || name === 'ref') continue;
        if (typeof value === 'function' || value === undefined || value === null || value === false) continue;
        if (typeof value === 'object') continue; // style objects and the like carry no translatable text
        out[PROP_TO_ATTR[name] ?? name] = value === true ? '' : String(value);
    }
    return Object.keys(out).length ? out : undefined;
}

function isPortal(node: unknown): node is ReactPortal {
    return typeof node === 'object' && node !== null && (node as { $$typeof?: symbol }).$$typeof === PORTAL;
}

export function toBlockNodes(children: ReactNode): Mapped {
    const elements: ReactElement[] = [];
    const portals: ReactPortal[] = [];
    let failure: string | undefined;

    /** Flatten one level of React children into nodes, numbering elements in document order. */
    function mapLevel(level: ReactNode): BlockNode[] {
        const out: BlockNode[] = [];
        const visit = (node: ReactNode): void => {
            if (failure || node === null || node === undefined || typeof node === 'boolean') return;
            if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
                out.push({ text: String(node) });
                return;
            }
            if (Array.isArray(node)) return node.forEach(visit);
            if (isPortal(node)) {
                portals.push(node);
                return;
            }
            if (!isValidElement(node)) {
                failure = `an unsupported child (${typeof node})`;
                return;
            }
            const props = node.props as Record<string, unknown>;
            if (node.type === Fragment) return Children.toArray(props.children as ReactNode).forEach(visit);
            if (typeof node.type !== 'string') {
                failure = 'a component, provider, lazy or Suspense child, whose DOM is unknown until React renders it';
                return;
            }
            if (props.dangerouslySetInnerHTML) {
                failure = 'dangerouslySetInnerHTML, an HTML string rather than a tree';
                return;
            }
            elements.push(node);
            const kids = mapLevel(props.children as ReactNode);
            const attrs = attrsOf(props);
            out.push({ tag: node.type, ...(attrs ? { attrs } : {}), ...(kids.length ? { children: kids } : {}) });
        };
        Children.toArray(level).forEach(visit);
        return out;
    }

    const nodes = mapLevel(children);
    return failure ? { ok: false, reason: failure } : { ok: true, nodes, elements, portals };
}

/** DOM attribute names back to React prop names, for the ones that differ. */
const ATTR_TO_PROP: Record<string, string> = { class: 'className', for: 'htmlFor' };

/**
 * A rendered block back to React: each element is the original React element it renders
 * (`elements[source]`), cloned so its handlers, refs and key survive, with the attributes the
 * translation changed or the core added set on it, and its translated children. Comments are
 * another host's markers and render nothing here.
 */
export function toReactNodes(nodes: readonly RenderedNode[], elements: readonly ReactElement[]): ReactNode[] {
    return nodes.flatMap((node): ReactNode[] => {
        if ('text' in node) return [node.text];
        if ('comment' in node) return [];
        const original = elements[node.source];
        const originalProps = original.props as Record<string, unknown>;
        const changed: Record<string, unknown> = {};
        for (const [attr, value] of Object.entries(node.attrs)) {
            if (value === true) continue; // a bare attribute: the original prop already renders it
            const prop = ATTR_TO_PROP[attr] ?? attr;
            if (String(originalProps[prop] ?? '') !== value) changed[prop] = value;
        }
        const kids = toReactNodes(node.children, elements);
        return [kids.length ? cloneElement(original, changed, ...kids) : cloneElement(original, { ...changed, children: undefined } as Partial<unknown>)];
    });
}

/**
 * Whether children carry a value from a variable that no build step turned into a placeholder
 * (spec VAR-7). Literal JSX text reaches React as one string per run, so a text run split across
 * adjacent children — a string beside a number, or two strings that are not whitespace-only —
 * holds an interpolation (`Hello {name}` arrives as `['Hello ', 'Ana']`). Checked at every level
 * of host elements and fragments. A value that is the only text of its element (`<b>{name}</b>`)
 * cannot be told from literal text at runtime; only the build transform recovers it.
 */
export function hasRuntimeValues(children: ReactNode): boolean {
    let run: Array<string | number | bigint> = [];
    const flush = () => {
        const hit = run.some((p) => typeof p !== 'string') || run.filter((p) => String(p).trim() !== '').length > 1;
        run = [];
        return hit;
    };
    for (const c of [...Children.toArray(children), null]) {
        if (typeof c === 'string' || typeof c === 'number' || typeof c === 'bigint') {
            run.push(c);
            continue;
        }
        if (flush()) return true;
        if (isValidElement(c) && (typeof c.type === 'string' || c.type === Fragment)) {
            if (hasRuntimeValues((c.props as { children?: ReactNode }).children)) return true;
        }
    }
    return false;
}
