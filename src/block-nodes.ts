/**
 * React children to the core's `BlockNode[]`, for rendering `<Translate>` / `<Phrase>` content
 * through the core's non-DOM block path.
 *
 * What is mapped is exactly what the client's DOM walk would see: host elements with their
 * attributes, strings and numbers. Fragments, arrays and conditional `null` / `false` flatten
 * away, as they do in the DOM. `<DontTranslate>` is this package's own and renders one host
 * element from its props, so it is mapped as that element. A portal renders outside the host on
 * both sides, so it is kept for rendering but excluded from the nodes. A child whose DOM is
 * unknown until React renders it — any other function or class component, a provider, `lazy`,
 * `Suspense` — or whose content is an HTML string (`dangerouslySetInnerHTML`) makes the block
 * unmappable: it is not server-rendered, and its source is served as it is (fleet rule).
 *
 * `elements[i]` is the React element that the `i`th element node of `nodes`, counted in document
 * order, came from. That is what the core's `source` back-reference on a translated element
 * holds: the binding clones that element, with its handlers, refs and key, into the translated
 * position, which a translation may have moved.
 */
import * as React from 'react';
import { Children, Fragment, cloneElement, createElement, isValidElement, type ReactElement, type ReactNode, type ReactPortal, type Usable } from 'react';
import { isTranslationExcluded, type BlockNode, type RenderedNode } from 'langsys-js-typescript';
import { NON_TRANSLATABLE_ELEMENTS } from 'langsys-js-typescript/pure';
import { DontTranslate, type DontTranslateProps } from './components/DontTranslate.js';

export type Mapped =
    | { ok: true; nodes: BlockNode[]; elements: ReactElement[]; portals: ReactPortal[] }
    | { ok: false; reason: string };

const PORTAL = Symbol.for('react.portal');

/** React prop names to DOM attribute names, for the props that differ. */
const PROP_TO_ATTR: Record<string, string> = { className: 'class', htmlFor: 'for' };

/**
 * A prop's value as the attribute the core reads: `true` is a bare attribute (`''`); a function,
 * an object (a style and the like, which carries no translatable text), `false` and nothing have
 * none.
 */
function attrValue(value: unknown): string | undefined {
    if (typeof value === 'function' || typeof value === 'object' || value === undefined || value === false) return undefined;
    return value === true ? '' : String(value);
}

function attrsOf(props: Record<string, unknown>): Record<string, string> | undefined {
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(props)) {
        if (name === 'children' || name === 'key' || name === 'ref') continue;
        const attr = attrValue(value);
        if (attr !== undefined) out[PROP_TO_ATTR[name] ?? name] = attr;
    }
    return Object.keys(out).length ? out : undefined;
}

const CONTEXT = Symbol.for('react.context');

/**
 * React 19's `use`, read off the module so the binding loads under React 18, which has none and
 * renders neither a promise nor a context as a child: there such a value stays a node, for React.
 */
const read = (React as { use?: <T>(usable: Usable<T>) => T }).use;

/** A context object, which React 19 renders as its current value. */
function isContext(node: unknown): node is React.Context<unknown> {
    return typeof node === 'object' && node !== null && (node as { $$typeof?: symbol }).$$typeof === CONTEXT;
}

/** A value React 19 renders by reading it, as `use` does: a thenable, or a context. */
function isUsable(node: unknown): node is Usable<unknown> {
    if (typeof node !== 'object' || node === null) return false;
    return typeof (node as PromiseLike<unknown>).then === 'function' || (node as { $$typeof?: symbol }).$$typeof === CONTEXT;
}

/** A value the core's params take (its `ParamPrimitive`): text, a number, a boolean, a date (from any realm). */
function isParamValue(value: unknown): boolean {
    return (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        Object.prototype.toString.call(value) === '[object Date]'
    );
}

/**
 * Each one-shot list's items (a generator, an iterator: its own iterator), as first read, since a
 * unit renders again (hydration, a locale change) with the same props. A list that can be read again
 * (a `Set`, a `Map`) is read again at each render, as React reads one.
 */
const oneShotItems = new WeakMap<Iterable<ReactNode>, ReactNode[]>();

function itemsOf(list: Iterable<ReactNode>): ReactNode[] {
    if ((list[Symbol.iterator]() as unknown) !== list) return Array.from(list);
    let items = oneShotItems.get(list);
    if (!items) oneShotItems.set(list, (items = Array.from(list)));
    return items;
}

/** A child React renders as a list: an iterable that is neither text nor an element (a `Set`, a generator). */
function isIterable(node: unknown): node is Iterable<ReactNode> {
    return typeof node === 'object' && node !== null && !isValidElement(node) && typeof (node as Iterable<ReactNode>)[Symbol.iterator] === 'function';
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
            if (node.type === DontTranslate) return visit(DontTranslate(props as DontTranslateProps));
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
        Children.toArray(withoutFragments(level)).forEach(visit);
        return out;
    }

    const nodes = mapLevel(children);
    return failure ? { ok: false, reason: failure } : { ok: true, nodes, elements, portals };
}

/** DOM attribute names back to React prop names, for the ones that differ. */
const ATTR_TO_PROP: Record<string, string> = { class: 'className', for: 'htmlFor' };

/** `text` as a pattern that matches its characters literally. */
const literally = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The prop an attribute the core hands back sets on the original element. The core reads names as
 * HTML does, ignoring case, so `tabindex` is the element's own `tabIndex`; an attribute the
 * element does not have (one the core adds) keeps its name.
 */
function propFor(attr: string, props: Record<string, unknown>): string {
    const same = new RegExp(`^${literally(attr)}$`, 'i');
    return ATTR_TO_PROP[attr] ?? Object.keys(props).find((name) => same.test(name)) ?? attr;
}

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
            const prop = propFor(attr, originalProps);
            // Compared as `attrsOf` handed it over, so a boolean prop (`disabled`, sent as `''`) stays the prop it is.
            if ((attrValue(originalProps[prop]) ?? '') !== value) changed[prop] = value;
        }
        const kids = toReactNodes(node.children, elements);
        return [kids.length ? cloneElement(original, changed, ...kids) : cloneElement(original, { ...changed, children: undefined } as Partial<unknown>)];
    });
}

/**
 * Whether children carry a value from a variable that no build step turned into a placeholder
 * (spec VAR-7). Literal JSX text reaches React as one string per run, so a text run split across
 * adjacent children — two pieces, strings or numbers, that are not whitespace-only — holds an
 * interpolation (`Hello {name}` arrives as `['Hello ', 'Ana']`). A fragment's children are read as
 * part of the run around them, as React renders them. Checked at every level of host elements and
 * `<DontTranslate>`. A value that is the only text of its element (`<b>{name}</b>`, `<b>{count}</b>`)
 * cannot be told from literal text at runtime; only the build transform recovers it, and the value
 * marker it writes (VAR-3) holds its value alone, so it never reads as split.
 *
 * With `skipExcluded`, for a `<Phrase>`, a subtree the core shows as written (`<DontTranslate>`,
 * an element its `isTranslationExcluded` excludes, or code and notation, `NON_TRANSLATABLE_ELEMENTS`)
 * is not read: the phrase keys it as one empty markup pair whatever it holds (TOK-1), so a value
 * inside it never enters the phrase. A `<Translate>` block stores that subtree in its content, so
 * there it still counts.
 */
export function hasRuntimeValues(children: ReactNode, skipExcluded = false): boolean {
    let run: Array<string | number | bigint> = [];
    const flush = () => {
        const hit = run.filter((p) => String(p).trim() !== '').length > 1;
        run = [];
        return hit;
    };
    for (const c of [...inRun(children), null]) {
        if (typeof c === 'string' || typeof c === 'number' || typeof c === 'bigint') {
            run.push(c);
            continue;
        }
        if (flush()) return true;
        if (!isValidElement(c)) continue;
        const node = c.type === DontTranslate ? DontTranslate(c.props as DontTranslateProps) : c;
        if (typeof node.type !== 'string') continue;
        const props = node.props as Record<string, unknown>;
        if (skipExcluded && opaqueInPhrase(node.type, props)) continue;
        if (hasRuntimeValues(props.children as ReactNode, skipExcluded)) return true;
    }
    return false;
}

/**
 * Children with each fragment replaced by its children as a nested array, so `Children.toArray`
 * flattens them into the level and keys every element by its place in the whole level: an element
 * from a fragment never shares a key with one beside the fragment.
 */
function withoutFragments(node: ReactNode): ReactNode {
    // React 19 renders a context as its current value: read it as React reads it.
    if (read && isContext(node)) return withoutFragments(read(node) as ReactNode);
    if (Array.isArray(node)) return node.map(withoutFragments);
    if (isIterable(node)) return Array.from(node, withoutFragments);
    if (isValidElement(node) && node.type === Fragment) return [withoutFragments((node.props as { children?: ReactNode }).children)];
    return node;
}

/** A level of children as React renders it: arrays and fragments flattened, so a fragment's text joins the run around it. */
function inRun(level: ReactNode): ReactNode[] {
    return Children.toArray(withoutFragments(level));
}

/** Whether the core keys an element as one empty pair in a phrase: its exclusion, or code and notation. */
function opaqueInPhrase(tag: string, props: Record<string, unknown>): boolean {
    return NON_TRANSLATABLE_ELEMENTS.includes(tag) || isTranslationExcluded(attributeReader(tag, attrsOf(props)));
}

/** A mapped element's attributes (`attrsOf`, as the tree path hands them to the core), in the shape the core's exclusion reads. */
function attributeReader(tagName: string, attrs: Record<string, string> | undefined) {
    const valueOf = (name: string) => Object.entries(attrs ?? {}).find(([key]) => key === name)?.[1];
    return { tagName, getAttribute: (name: string) => valueOf(name) ?? null, hasAttribute: (name: string) => valueOf(name) !== undefined };
}

/**
 * Children and params as React would render the values the build transform made params: the
 * transform cannot tell a value's type, so `Click {icon} to go` becomes `Click %icon% to go` with
 * `icon` a param, and the value decides here. A value the core's params take (text, a number, a
 * boolean, a date) stays a param: a boolean stays a boolean, which the core formats and a select
 * branches on, as in `t()`. Null and undefined, which React renders as nothing, fill their
 * placeholder with nothing, and a bigint, which the core's params do not take, is its digits. On
 * React 19 a promise or a context is read as React reads one in place (`use`), and its value decides
 * the same way. Anything else (an element, a portal, a list, a function) is put back where its
 * `%name%` placeholder stands, for React to render as it renders it; a one-shot list (a generator)
 * is read once, and its items kept for the unit's next render, while a `Set` is read at each. Text inside host elements, fragments and
 * `<DontTranslate>` is searched, as the transform rewrites it; a node param with no placeholder is
 * dropped. A restored node is wrapped in a fragment keyed by its place in the run, so it never
 * shares a key with the unit's other elements and needs none of its own. Children with no node
 * param are returned as they are.
 */
export function withNodeParams<P extends Readonly<Record<string, unknown>>>(
    children: ReactNode,
    given: P,
): { children: ReactNode; params: P } {
    const nodes: Record<string, ReactNode> = {};
    const rest: Record<string, unknown> = {};
    for (const [name, param] of Object.entries(given)) {
        // A promise or a context is read as React reads one in place (`use`), and its value taken as given.
        const value = read && isUsable(param) ? read(param) : param;
        if (value === null || value === undefined) rest[name] = '';
        else if (typeof value === 'bigint') rest[name] = String(value);
        else if (isParamValue(value)) rest[name] = value;
        else nodes[name] = isIterable(value) && !Array.isArray(value) ? itemsOf(value) : (value as ReactNode);
    }
    const names = Object.keys(nodes);
    if (!names.length) return { children, params: rest as P };
    const split = new RegExp(`%(${names.map(literally).join('|')})%`);

    const visit = (node: ReactNode): ReactNode => {
        if (typeof node === 'string') {
            const parts = node.split(new RegExp(split.source, 'g'));
            if (parts.length === 1) return node;
            return parts
                .map((part, i) => (i % 2 ? createElement(Fragment, { key: i }, nodes[part]) : part))
                .filter((part) => part !== '');
        }
        if (Array.isArray(node)) {
            const kids = node.map(visit);
            return kids.some((kid, i) => kid !== node[i]) ? kids : node;
        }
        if (!isValidElement(node)) return node;
        if (typeof node.type !== 'string' && node.type !== Fragment && node.type !== DontTranslate) return node;
        const own = (node.props as { children?: ReactNode }).children;
        if (own === undefined) return node;
        const kids = Array.isArray(own) ? own.map(visit) : [visit(own)];
        const same = Array.isArray(own) ? kids.every((kid, i) => kid === own[i]) : kids[0] === own;
        return same ? node : cloneElement(node, undefined, ...kids);
    };
    return { children: visit(children), params: rest as P };
}
