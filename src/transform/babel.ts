/**
 * langsys-js-react/babel — the placeholder transform (spec VAR-6), as a Babel plugin.
 *
 * A value interpolated into translated text becomes a named placeholder, and the value travels as
 * its param, so one sentence registers once however many users it is shown to (VAR-1):
 *
 *   <Translate>Hello {user.name}</Translate>
 *     → <Translate params={{ name: user.name }}>Hello %name%</Translate>
 *
 *   t(`You have ${items.length} items`)
 *     → t('You have {items_count} items', undefined, { items_count: items.length })
 *
 * A subtree the core shows as written — `<DontTranslate>`, a host element with `translate="no"` or
 * `data-notrans`, or code and notation (`<template>`, `<noscript>`, `<math>`) — is never translated:
 * a phrase keys it as one opaque element and restores its content, and a block keeps it in its
 * stored content. A value there therefore stays where it is, in both components, and is marked as a
 * value (VAR-3) rather than replaced, so the page shows the value and a block's stored content holds
 * its placeholder; where no marker can stand (below) it is left as written instead. A `translate`
 * or `data-notrans` whose value is an expression is known only at runtime. In a `<Translate>` a
 * value under it is marked and passed as a param too, so excluded it shows as written, and
 * translated the core reads the marker as its placeholder and fills it from the param, which wins
 * over the marked text. In a `<Phrase>` it is a placeholder like any other: translated, the phrase
 * fills it; excluded, the core keys the element as one empty pair and fills the caller's params into
 * an author's exclusion. A `<Phrase>` holding a marker of its own in its text (inside a conditional
 * or a component too) is served as its source until a translation exists, so its other values are
 * marked too, and passed as params; one in its translated text where no marker can stand is left
 * as written, and the phrase gets `data-ls-unnamed`. A name a marker already carries is taken, as an
 * explicit `%name%` is. An opt-out passed through a spread is not seen. Where no marker element
 * can stand — inside MathML and SVG an HTML `<span>` draws nothing, and `<textarea>`, `<title>` and
 * `<option>` hold text only — a value in such a subtree is left as written, and a `<Translate>`,
 * which would store it, gets `data-ls-unnamed` and registers nothing (VAR-7); a `<Phrase>` keys the
 * subtree as one empty pair. `<script>` and `<style>` hold raw text, which a block stores as
 * written and a phrase keys as one empty pair: a value there is left as written, and a `<Translate>`
 * holding one gets `data-ls-unnamed`.
 *
 *   <Translate>Signed in as <DontTranslate>{user.email}</DontTranslate></Translate>
 *     → <Translate>Signed in as <DontTranslate><span data-ls-param="email">{user.email}</span></DontTranslate></Translate>
 *
 * Only `<Translate>` and `<Phrase>` imported from `langsys-js-react` are rewritten, and only the
 * children a host element, a fragment or `<DontTranslate>` renders as text: an expression inside a
 * nested host element (`<b>{x}</b>`) is included; one that is itself JSX or holds JSX
 * (`items.map((i) => <li>…`), a conditional, already marked (`data-ls-param`), or sits inside
 * another component or a nested `<Translate>` / `<Phrase>` is left alone, since React renders nodes
 * from it rather than a value's text. `{children}` (under any TypeScript cast) that is all the
 * text of its run in translated text (what React renders between two elements) is content to
 * translate and is left alone; beside text, or in a subtree that is not translated, it is a value. A value whose type only the page knows, an element held in a variable, is rewritten like
 * any other, and `<Translate>` / `<Phrase>` render it in its placeholder's place
 * (`withNodeParams`). String, number and plain template literals (`{' '}`, `{3}`) are static text,
 * and a fragment (`<>…</>`, React's `Fragment`) is unwrapped, as React passes its children on. A
 * children list the transform changes reaches React as a JSX compiler hands it over from the
 * source, each run of text one string (JSX's whitespace rule applied, a comment dropped), so the
 * runtime never takes a unit's own text for a value split from it (VAR-7); this holds in the JSX
 * compiler's own Babel pass and when the output is compiled again. `t()` calls are rewritten where
 * `t` is the binding a `useT()` call made (and `<Translate>` / `<Phrase>` matched by their import's
 * binding), so another function named `t` is left alone. A `+` chain joins as JavaScript joins it:
 * a sum before the first string, or in parentheses, is one value. A key built in the call (its own
 * text has no space: `errors.${code}`, `status_${status}`) is left as it is, since legacy-key mode
 * looks it up as built. A name the developer wrote (`%name%` anywhere in a unit, `{name}` in a `t()`
 * text whose call passes params) is never given to a value. Names follow VAR-2 (`./naming`); an expression
 * no name can be derived from is named `value`, `value_2`, … and reported in
 * `file.metadata.langsys.warnings`, which the Vite plugin and the Next loader surface as build
 * warnings.
 */
import type { NodePath, PluginObj, PluginPass, types as t } from '@babel/core';
import { NON_TRANSLATABLE_ELEMENTS } from 'langsys-js-typescript/pure';
import { nameAll, type Named } from './naming.js';

const SOURCE = 'langsys-js-react';
const TARGETS = new Set(['Translate', 'Phrase']);
const VERBATIM = 'DontTranslate';
/** Elements whose content is raw text, which a block stores as written: a value there is left as written. */
const RAW_TEXT = new Set(['script', 'style']);
/** Elements that hold text only, where a marker element is not drawn or not allowed. */
const TEXT_ONLY = new Set(['textarea', 'title', 'option']);

/**
 * How a value is written where it stands: `text` in translated text, replaced by `%name%` and a
 * param; `shown` where the core shows the content as written, marked (VAR-3); `unknown`, in a
 * `<Translate>` only, under an opt-out whose value only the page knows, marked and passed as a param
 * too.
 */
type Mode = 'text' | 'shown' | 'unknown';

interface Where {
    mode: Mode;
    /** The foreign namespace the value is in, MathML or SVG, where an HTML `<span>` draws nothing. */
    foreign: 'math' | 'svg' | null;
    /** Whether no marker element can stand here: in a foreign namespace, or in an element that holds text only. */
    markerless: boolean;
}

/** Set on a `<Translate>` that would store a value the transform left as written: it registers nothing (VAR-7). */
const UNNAMED = 'data-ls-unnamed';
const EXPLICIT = /%([A-Za-z_][A-Za-z0-9_]*)%/g;
/** A placeholder as a `t()` text writes it: `{name}`, or an ICU argument `{name, plural, …}`. */
const BRACED = /\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,}]/g;

export interface LangsysTransformMetadata {
    /** One entry per unnameable expression: where it is, and the name it was given. */
    warnings: Array<{ line: number | null; column: number | null; source: string; name: string }>;
    /** How many units were rewritten. */
    rewritten: number;
}

interface State extends PluginPass {
    targets: Set<string>;
    /** Local names of `<Phrase>`, which keys code, notation and an author's exclusion as one empty pair. */
    phrases: Set<string>;
    verbatim: Set<string>;
    /** Local names of React's `Fragment`, and of the `react` module itself (`React.Fragment`). */
    fragments: Set<string>;
    reactModules: Set<string>;
    hooks: Set<string>;
    /**
     * The declaring identifiers of `<Translate>` / `<Phrase>` and `useT` imported from the package, and
     * of each `t` a `useT()` call bound: a binding's identifier is the same node after another plugin
     * in the pass crawls the scope again, where its `Binding` object is not.
     */
    targetBindings: Set<t.Identifier>;
    hookBindings: Set<t.Identifier>;
    tBindings: Set<t.Identifier>;
    meta: LangsysTransformMetadata;
}

type Babel = { types: typeof t };

export default function langsysPlaceholders({ types: T }: Babel): PluginObj<State> {
    const sourceOf = (state: State, node: t.Node) => state.file.code.slice(node.start ?? 0, node.end ?? 0);

    const warn = (state: State, n: Named) => {
        if (!n.unnameable) return;
        const loc = n.expression.loc?.start;
        state.meta.warnings.push({ line: loc?.line ?? null, column: loc?.column ?? null, source: n.source, name: n.name });
    };

    /**
     * Names the developer already wrote: as `%name%` (or, in a `t()` text, `{name}`) in static text,
     * or as keys of a params literal.
     */
    const explicitNames = (texts: string[], params: t.Expression | null, written = EXPLICIT): Set<string> => {
        const out = new Set<string>();
        for (const s of texts) for (const m of s.matchAll(written)) out.add(m[1]);
        if (params && params.type === 'ObjectExpression') {
            for (const p of params.properties) {
                if (p.type === 'ObjectProperty' && !p.computed) {
                    if (p.key.type === 'Identifier') out.add(p.key.name);
                    else if (p.key.type === 'StringLiteral') out.add(p.key.value);
                }
            }
        }
        return out;
    };

    /**
     * Whether the core shows a host element's subtree as written: `shown` for code and notation
     * (`NON_TRANSLATABLE_ELEMENTS`) or an opt-out in its attributes as `isTranslationExcluded` reads
     * them (`translate` equal to `no` in any case, or `data-notrans` present and not `false` / `0`);
     * `unknown` when such an attribute's value is an expression, which only the page knows; null
     * otherwise.
     */
    const optOut = (tag: string, opening: t.JSXOpeningElement): 'shown' | 'unknown' | null => {
        if (NON_TRANSLATABLE_ELEMENTS.includes(tag)) return 'shown';
        let unknown = false;
        for (const a of opening.attributes) {
            if (a.type !== 'JSXAttribute' || a.name.type !== 'JSXIdentifier') continue;
            if (a.name.name !== 'translate' && a.name.name !== 'data-notrans') continue;
            const text = attributeText(a);
            if (text === undefined) unknown = true;
            else if (a.name.name === 'translate' ? text.toLowerCase() === 'no' : !['false', '0'].includes(text.trim().toLowerCase())) {
                return 'shown';
            }
        }
        return unknown ? 'unknown' : null;
    };

    /** `children`, or `x.children`, under any TypeScript cast or assertion: the content a wrapper is given. */
    const isChildren = (e: t.Expression): boolean => {
        while (
            e.type === 'TSAsExpression' ||
            e.type === 'TSSatisfiesExpression' ||
            e.type === 'TSNonNullExpression' ||
            e.type === 'TSTypeAssertion' ||
            e.type === 'ParenthesizedExpression'
        ) {
            e = e.expression;
        }
        return (
            (e.type === 'Identifier' && e.name === 'children') ||
            ((e.type === 'MemberExpression' || e.type === 'OptionalMemberExpression') &&
                !e.computed &&
                e.property.type === 'Identifier' &&
                e.property.name === 'children')
        );
    };

    /** An expression holding JSX: React renders nodes from it, not a value's text. */
    const holdsJsx = (e: t.Node): boolean => {
        let jsx = false;
        T.traverseFast(e, (n) => {
            if (n.type === 'JSXElement' || n.type === 'JSXFragment') jsx = true;
        });
        return jsx;
    };

    /** A literal's text, for the literals that are static text: string, number, and a template with no expression. */
    const literalOf = (e: t.Node): string | undefined =>
        e.type === 'StringLiteral' || e.type === 'NumericLiteral'
            ? String(e.value)
            : e.type === 'TemplateLiteral' && !e.expressions.length
              ? (e.quasis[0].value.cooked ?? undefined)
              : undefined;

    /** Whether an element is React's `Fragment` (`<Fragment>`, `<React.Fragment>`), imported from `react`. */
    const isFragment = (state: State, name: t.JSXOpeningElement['name']): boolean =>
        (name.type === 'JSXIdentifier' && state.fragments.has(name.name)) ||
        (name.type === 'JSXMemberExpression' &&
            name.object.type === 'JSXIdentifier' &&
            state.reactModules.has(name.object.name) &&
            name.property.name === 'Fragment');

    /** Every static text in a unit, where a `%name%` may be written: its text, attributes and string literals. */
    const staticTexts = (unit: t.JSXElement): string[] => {
        const out: string[] = [];
        for (const child of unit.children) {
            T.traverseFast(child, (n) => {
                if (n.type === 'JSXText' || n.type === 'StringLiteral') out.push(n.value);
                else if (n.type === 'TemplateElement') out.push(n.value.cooked ?? n.value.raw);
            });
        }
        return out;
    };

    /** Whether a node holds a value marker anywhere in it. */
    const holdsMarker = (node: t.Node): boolean => {
        let found = false;
        T.traverseFast(node, (n) => {
            if (n.type === 'JSXOpeningElement' && marks(n)) found = true;
        });
        return found;
    };

    /** The names the value markers in a unit already carry: taken, as an explicit `%name%` is. */
    const markedNames = (unit: t.JSXElement): Set<string> => {
        const out = new Set<string>();
        for (const child of unit.children) {
            T.traverseFast(child, (n) => {
                if (n.type !== 'JSXAttribute' || n.name.type !== 'JSXIdentifier' || n.name.name !== 'data-ls-param') return;
                const name = n.value ? attributeText(n) : undefined;
                if (name) out.add(name.trim());
            });
        }
        return out;
    };

    /** Whether a host element is already a value marker, holding its value (VAR-3). */
    const marks = (opening: t.JSXOpeningElement): boolean =>
        opening.attributes.some(
            (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'data-ls-param',
        );

    /** An attribute's value as the DOM reads it: `''` when bare, undefined when it is an expression. */
    const attributeText = (a: t.JSXAttribute): string | undefined => {
        const v = a.value;
        if (!v) return '';
        if (v.type === 'StringLiteral') return v.value;
        if (v.type === 'JSXExpressionContainer' && v.expression.type === 'StringLiteral') return v.expression.value;
        return undefined;
    };

    /** The value marker (VAR-3) around an expression: `<span data-ls-param="name">{expression}</span>`. */
    const marker = (name: string, expression: t.Expression): t.JSXElement =>
        T.jsxElement(
            T.jsxOpeningElement(T.jsxIdentifier('span'), [
                T.jsxAttribute(T.jsxIdentifier('data-ls-param'), T.stringLiteral(name)),
            ]),
            T.jsxClosingElement(T.jsxIdentifier('span')),
            [T.jsxExpressionContainer(expression)],
        );

    /** A JSX text as a JSX compiler hands it to React: its lines trimmed and joined (React's JSX whitespace rule). */
    const asRendered = (text: t.JSXText): string => {
        const [s] = T.react.buildChildren(
            T.jsxElement(T.jsxOpeningElement(T.jsxIdentifier('x'), []), T.jsxClosingElement(T.jsxIdentifier('x')), [text]),
        );
        return s?.type === 'StringLiteral' ? s.value : '';
    };

    /**
     * A run of text written so every JSX compiler hands React exactly `value`, in its own Babel pass
     * (the node's value) and from the generated code (its raw form): JSX text, with the characters
     * JSX gives a meaning to as entities, or a string literal where a line break, a tab or a line or
     * paragraph separator would be trimmed or read differently by another compiler.
     */
    const textNode = (value: string): t.JSXText | t.JSXExpressionContainer => {
        if (/[\r\n\t\u2028\u2029]/.test(value)) return T.jsxExpressionContainer(T.stringLiteral(value));
        const node = T.jsxText(value);
        node.extra = { raw: value.replace(/[&<>{}]/g, (c) => `&#${c.charCodeAt(0)};`), rawValue: value };
        return node;
    };

    /**
     * One param per placeholder. Every expression is named by the core in order (VAR-2), and its
     * names decide what repeats: a self-naming expression written twice is one placeholder, so its
     * later occurrences share the first's name and param; an unnameable one is its own placeholder
     * every time, even when its source text repeats, since `{a + b}` twice cannot be told from
     * `{i++}` twice. Source text is never compared.
     */
    const placeholders = (named: Named[]): Named[] => {
        const seen = new Set<string>();
        return named.filter((n) => !seen.has(n.name) && seen.add(n.name));
    };

    const mergeParams = (existing: t.Expression | null, named: Named[]): t.Expression => {
        const props = named.map((n) => T.objectProperty(T.identifier(n.name), n.expression));
        if (!existing) return T.objectExpression(props);
        if (existing.type === 'ObjectExpression') return T.objectExpression([...existing.properties, ...props]);
        return T.objectExpression([T.spreadElement(existing), ...props]);
    };

    // ---- JSX: <Translate> / <Phrase> children --------------------------------------------------

    function rewriteTarget(path: NodePath<t.JSXElement>, state: State) {
        const found: Array<{
            source: string;
            expression: t.Expression;
            /** Whether it travels as a param: in translated text, or under an opt-out only the page knows. */
            param: boolean;
            /** Text in translated text where no marker element can stand. */
            bare: boolean;
            replace: (name: string) => void;
        }> = [];
        const tag = path.node.openingElement.name;
        const isPhrase = tag.type === 'JSXIdentifier' && state.phrases.has(tag.name);
        let unnamed = false;
        /**
         * A phrase holding a marker in its text is served as its source until a translation exists
         * (the core keeps its markers), so its other values are marked too, and passed as params.
         */
        let markAll = false;
        /** Text this transform wrote (a literal, a placeholder), which React shows as it is. */
        const asWritten = new WeakSet<t.JSXText>();
        const written = (value: string): t.JSXText => {
            const node = T.jsxText(value);
            asWritten.add(node);
            return node;
        };
        /** The children lists this transform changed, each settled into one string per run of text. */
        const touched = new Set<t.JSXElement['children']>();
        /**
         * A changed list as React receives it from the source: each run of text (JSX text, written
         * text) one string, and a comment between two texts gone, as a JSX compiler drops it. A
         * value split from its sentence in separate strings is how the runtime tells a value the
         * transform did not name (VAR-7), so text the transform wrote never arrives split.
         */
        const settle = (children: t.JSXElement['children']) => {
            const out: t.JSXElement['children'] = [];
            let run = '';
            for (const c of children) {
                if (c.type === 'JSXText') run += asWritten.has(c) ? c.value : asRendered(c);
                else if (c.type === 'JSXExpressionContainer' && c.expression.type === 'JSXEmptyExpression') continue;
                else {
                    if (run) out.push(textNode(run));
                    run = '';
                    out.push(c);
                }
            }
            if (run) out.push(textNode(run));
            children.splice(0, children.length, ...out);
        };

        /**
         * A fragment's children in its place: React passes them on to the parent's, so its text joins
         * the run around it.
         */
        const unwrap = (children: t.JSXElement['children']) => {
            for (let i = 0; i < children.length; i++) {
                const c = children[i];
                if (c.type === 'JSXFragment' || (c.type === 'JSXElement' && isFragment(state, c.openingElement.name))) {
                    children.splice(i--, 1, ...c.children);
                    touched.add(children);
                }
            }
        };

        /**
         * Whether the child at `i` is all the text of its run (what React renders between two
         * elements): `{children}` there is content to translate, and beside text a value.
         */
        const aloneInRun = (children: t.JSXElement['children'], i: number): boolean => {
            for (const step of [-1, 1]) {
                for (let j = i + step; j >= 0 && j < children.length; j += step) {
                    const d = children[j];
                    if (d.type === 'JSXElement' || d.type === 'JSXFragment') break;
                    if (d.type === 'JSXText') {
                        if ((asWritten.has(d) ? d.value : asRendered(d)).trim()) return false;
                        continue;
                    }
                    if (d.type === 'JSXSpreadChild') return false;
                    const x = d.expression;
                    if (x.type === 'JSXEmptyExpression') continue;
                    const literal = literalOf(x);
                    if (literal !== undefined) {
                        if (literal.trim()) return false;
                        continue;
                    }
                    if (holdsJsx(x)) break;
                    return false;
                }
            }
            return true;
        };

        const walk = (children: t.JSXElement['children'], where: Where) => {
            unwrap(children);
            children.forEach((c, i) => {
                if (c.type === 'JSXExpressionContainer') {
                    const e = c.expression;
                    if (e.type === 'JSXEmptyExpression') {
                        touched.add(children);
                        return;
                    }
                    const literal = literalOf(e);
                    if (literal !== undefined) {
                        children[i] = written(literal);
                        touched.add(children);
                        return;
                    }
                    if (
                        e.type === 'JSXElement' ||
                        e.type === 'JSXFragment' ||
                        e.type === 'LogicalExpression' ||
                        e.type === 'ConditionalExpression' ||
                        holdsJsx(e) ||
                        (where.mode === 'text' && isChildren(e) && aloneInRun(children, i))
                    ) {
                        if (isPhrase && where.mode === 'text' && holdsMarker(e)) markAll = true;
                        return;
                    }
                    if (where.mode !== 'text' && where.markerless) {
                        // A marker element inside MathML or SVG draws nothing, and an element that
                        // holds text only cannot take one, so the value is left as written. A block
                        // would store it in its content; a phrase keys code, notation and an
                        // exclusion as one empty pair.
                        if (!isPhrase) unnamed = true;
                        return;
                    }
                    touched.add(children);
                    found.push({
                        source: sourceOf(state, e),
                        expression: e,
                        param: where.mode !== 'shown',
                        bare: where.mode === 'text' && where.markerless,
                        replace: (name) => {
                            children[i] = where.mode === 'text' && !markAll ? written(`%${name}%`) : marker(name, e);
                        },
                    });
                } else if (c.type === 'JSXElement') {
                    const n = c.openingElement.name;
                    if (n.type !== 'JSXIdentifier' || (/^[A-Z]/.test(n.name) && !state.verbatim.has(n.name))) {
                        // Another component's content is its own; a marker of the phrase's in it still counts.
                        if (isPhrase && where.mode === 'text' && holdsMarker(c)) markAll = true;
                        return;
                    }
                    if (/^[a-z]/.test(n.name)) {
                        if (RAW_TEXT.has(n.name)) {
                            // Raw text takes no marker. A block stores it as written, so a value there
                            // registers nothing; a phrase keys it as one empty pair.
                            const value = (d: t.JSXElement['children'][number]) =>
                                d.type === 'JSXExpressionContainer' &&
                                d.expression.type !== 'JSXEmptyExpression' &&
                                literalOf(d.expression) === undefined;
                            if (!isPhrase && c.children.some(value)) unnamed = true;
                            return;
                        }
                        if (marks(c.openingElement)) {
                            if (isPhrase && where.mode === 'text') markAll = true;
                            return;
                        }
                        const opt = optOut(n.name, c.openingElement);
                        // In a phrase, a value under an opt-out only the page knows is a placeholder:
                        // translated, the phrase fills it; excluded, the core fills the caller's
                        // params into an author's exclusion, and keys it as one empty pair.
                        const mode: Mode =
                            where.mode === 'shown' || opt === 'shown'
                                ? 'shown'
                                : !isPhrase && (where.mode === 'unknown' || opt === 'unknown')
                                  ? 'unknown'
                                  : 'text';
                        const foreign =
                            n.name === 'math' || n.name === 'svg'
                                ? n.name
                                : where.foreign === 'svg' && n.name === 'foreignObject'
                                  ? null
                                  : where.foreign;
                        walk(c.children, { mode, foreign, markerless: foreign !== null || TEXT_ONLY.has(n.name) });
                    } else if (state.verbatim.has(n.name)) walk(c.children, { ...where, mode: 'shown' });
                }
            });
        };
        walk(path.node.children, { mode: 'text', foreign: null, markerless: false });
        if (markAll && found.some((f) => f.bare)) {
            // Every value in the phrase is marked, and one where no marker can stand would show its
            // placeholder until a translation exists: it is left as written, and the phrase, which
            // would key it, registers nothing.
            unnamed = true;
            for (let i = found.length - 1; i >= 0; i--) if (found[i].bare) found.splice(i, 1);
        }
        const attrs = path.node.openingElement.attributes;
        if (unnamed && !attrs.some((a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === UNNAMED)) {
            attrs.push(T.jsxAttribute(T.jsxIdentifier(UNNAMED), T.stringLiteral('')));
        }
        if (!found.length) {
            touched.forEach(settle);
            if (unnamed || touched.size) state.meta.rewritten++;
            return;
        }

        const existing = attrs.find(
            (a): a is t.JSXAttribute => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'params',
        );
        const existingExpr =
            existing?.value?.type === 'JSXExpressionContainer' && existing.value.expression.type !== 'JSXEmptyExpression'
                ? existing.value.expression
                : null;

        const named = nameAll(found, new Set([...explicitNames(staticTexts(path.node), existingExpr), ...markedNames(path.node)]));
        found.forEach((f, i) => f.replace(named[i].name));
        placeholders(named).forEach((n) => warn(state, n));
        // A marked value carries itself; a replaced one, or one under an opt-out only the page
        // knows, travels as a param.
        const params = placeholders(named.filter((_, i) => found[i].param));
        touched.forEach(settle);

        if (params.length) {
            const value = T.jsxExpressionContainer(mergeParams(existingExpr, params));
            if (existing) existing.value = value;
            else attrs.push(T.jsxAttribute(T.jsxIdentifier('params'), value));
        }
        state.meta.rewritten++;
    }

    // ---- t() calls -----------------------------------------------------------------------------

    /**
     * The pieces of a template literal, or of a `+` chain holding at least one string, in order, as
     * JavaScript joins them: `+` adds left to right, so what stands before the first string adds as
     * it would (`a + b + ' total'`) and a sum in parentheses is its own operand; both are one value.
     */
    function pieces(node: t.Node): Array<string | t.Expression> | null {
        if (node.type === 'TemplateLiteral') {
            const out: Array<string | t.Expression> = [];
            node.quasis.forEach((q, i) => {
                if (q.value.cooked) out.push(q.value.cooked);
                if (i < node.expressions.length) out.push(node.expressions[i] as t.Expression);
            });
            return node.expressions.length ? out : null;
        }
        if (node.type !== 'BinaryExpression' || node.operator !== '+') return null;
        // The left spine, outermost first: each `+` adds its right operand to everything on its left.
        const spine: t.BinaryExpression[] = [];
        for (let n: t.Node = node; n.type === 'BinaryExpression' && n.operator === '+'; n = n.left) spine.push(n);
        const operands = [spine[spine.length - 1].left, ...spine.map((s) => s.right).reverse()] as t.Expression[];
        const first = operands.findIndex((o) => o.type === 'StringLiteral' || o.type === 'TemplateLiteral');
        if (first < 0) return null;
        const flat: Array<string | t.Expression> = [];
        if (first === 1) flat.push(operands[0]);
        else if (first > 1) flat.push(spine[spine.length - (first - 1)]);
        for (const o of operands.slice(first)) {
            if (o.type === 'StringLiteral') flat.push(o.value);
            else if (o.type === 'TemplateLiteral') flat.push(...(pieces(o) ?? [o.quasis[0].value.cooked ?? '']));
            else flat.push(o);
        }
        return flat.some((p) => typeof p !== 'string') ? flat : null;
    }

    /** A key built in the call (`errors.${code}`, `status_${status}`, `'common:' + id`): its text holds only a key's characters. */
    const isKeyShaped = (parts: Array<string | t.Expression>): boolean =>
        parts.every((p) => typeof p !== 'string' || /^[A-Za-z0-9_.:-]*$/.test(p));

    function rewriteCall(path: NodePath<t.CallExpression>, state: State) {
        const [phrase, category, params] = path.node.arguments;
        if (!phrase || phrase.type === 'SpreadElement' || phrase.type === 'ArgumentPlaceholder') return;
        const parts = pieces(phrase);
        // A key is looked up as it is built (legacy-key mode), not a sentence with a value in it.
        if (!parts || isKeyShaped(parts)) return;
        if (params && params.type === 'SpreadElement') return;

        const values = parts
            .filter((p): p is t.Expression => typeof p !== 'string')
            .map((e) => ({ source: sourceOf(state, e), expression: e }));
        const paramsExpr = (params as t.Expression | undefined) ?? null;
        // A `{name}` the text writes is the developer's when the call passes params that can fill it;
        // with none, it can only be the value's own (an ICU argument on it, `{count, plural, …}`).
        const written = paramsExpr ? parts.filter((p): p is string => typeof p === 'string') : [];
        const named = nameAll(values, explicitNames(written, paramsExpr, BRACED));
        let next = 0;
        const text = parts.map((p) => (typeof p === 'string' ? p : `{${named[next++].name}}`)).join('');
        const unique = placeholders(named);
        unique.forEach((n) => warn(state, n));

        path.node.arguments = [
            T.stringLiteral(text),
            (category as t.Expression | undefined) ?? T.identifier('undefined'),
            mergeParams(paramsExpr, unique),
        ];
        state.meta.rewritten++;
    }

    /** Whether a name, where it is used, refers to one of these bindings. */
    const isBound = (path: NodePath, name: string, bindings: Set<t.Identifier>): boolean => {
        const b = path.scope.getBinding(name);
        return !!b && bindings.has(b.identifier);
    };

    return {
        name: 'langsys-placeholders',
        pre(file) {
            this.meta = { warnings: [], rewritten: 0 };
            (file.metadata as unknown as { langsys: LangsysTransformMetadata }).langsys = this.meta;
            this.targets = new Set();
            this.phrases = new Set();
            this.hooks = new Set();
            this.targetBindings = new Set();
            this.hookBindings = new Set();
            this.tBindings = new Set();
            this.verbatim = new Set();
            this.fragments = new Set();
            this.reactModules = new Set();
        },
        visitor: {
            Program(program, state) {
                for (const stmt of program.node.body) {
                    if (stmt.type === 'ImportDeclaration' && stmt.source.value === 'react') {
                        for (const s of stmt.specifiers) {
                            if (s.type !== 'ImportSpecifier') state.reactModules.add(s.local.name);
                            else if ((s.imported.type === 'Identifier' ? s.imported.name : s.imported.value) === 'Fragment') {
                                state.fragments.add(s.local.name);
                            }
                        }
                    }
                    if (stmt.type !== 'ImportDeclaration' || stmt.source.value !== SOURCE) continue;
                    for (const s of stmt.specifiers) {
                        if (s.type !== 'ImportSpecifier') continue;
                        const imported = s.imported.type === 'Identifier' ? s.imported.name : s.imported.value;
                        if (TARGETS.has(imported)) state.targets.add(s.local.name);
                        if (imported === 'Phrase') state.phrases.add(s.local.name);
                        if (imported === 'useT') state.hooks.add(s.local.name);
                        if (imported === VERBATIM) state.verbatim.add(s.local.name);
                    }
                }
                if (!state.targets.size && !state.hooks.size) return;
                // Names are matched by binding, so a local of the same name is never taken for them.
                const bind = (names: Set<string>, into: Set<t.Identifier>) =>
                    names.forEach((name) => {
                        const b = program.scope.getBinding(name);
                        if (b) into.add(b.identifier);
                    });
                bind(state.targets, state.targetBindings);
                bind(state.hooks, state.hookBindings);
                // `const t = useT()` binds a translation function.
                program.traverse({
                    VariableDeclarator(d) {
                        const init = d.node.init;
                        if (
                            d.node.id.type === 'Identifier' &&
                            init?.type === 'CallExpression' &&
                            init.callee.type === 'Identifier' &&
                            isBound(d, init.callee.name, state.hookBindings)
                        ) {
                            const b = d.scope.getBinding(d.node.id.name);
                            if (b) state.tBindings.add(b.identifier);
                        }
                    },
                });
            },
            JSXElement(path, state) {
                const n = path.node.openingElement.name;
                if (n.type === 'JSXIdentifier' && isBound(path, n.name, state.targetBindings)) rewriteTarget(path, state);
            },
            CallExpression(path, state) {
                const callee = path.node.callee;
                const isT =
                    (callee.type === 'Identifier' && isBound(path, callee.name, state.tBindings)) ||
                    (callee.type === 'CallExpression' &&
                        callee.callee.type === 'Identifier' &&
                        isBound(path, callee.callee.name, state.hookBindings));
                if (isT) rewriteCall(path, state);
            },
        },
    };
}
