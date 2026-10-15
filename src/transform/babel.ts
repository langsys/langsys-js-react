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
 * A subtree that is not translated — `<DontTranslate>`, or a host element with `translate="no"` or
 * `data-notrans` — is shown as written: a phrase keys it as one opaque element and restores its
 * content, and a block keeps it in its stored content. A value there therefore stays where it is,
 * in both components, and is marked as a value (VAR-3) rather than replaced, so the page shows the
 * value and a block's stored content holds its placeholder:
 *
 *   <Translate>Signed in as <DontTranslate>{user.email}</DontTranslate></Translate>
 *     → <Translate>Signed in as <DontTranslate><span data-ls-param="email">{user.email}</span></DontTranslate></Translate>
 *
 * Only `<Translate>` and `<Phrase>` imported from `langsys-js-react` are rewritten, and only the
 * children a host element or `<DontTranslate>` renders as text: an expression inside a nested host
 * element (`<b>{x}</b>`) is included; one that is itself JSX, a conditional, already marked
 * (`data-ls-param`), or sits inside another component or a nested `<Translate>` / `<Phrase>` is
 * left alone. String and number literals (`{' '}`, `{3}`) are static text and are inlined. `t()`
 * calls are rewritten where `t` comes from `useT()`. Names follow VAR-2 (`./naming`); an expression
 * no name can be derived from is named `value`, `value_2`, … and reported in
 * `file.metadata.langsys.warnings`, which the Vite plugin and the Next loader surface as build
 * warnings.
 */
import type { NodePath, PluginObj, PluginPass, types as t } from '@babel/core';
import { nameAll, type Named } from './naming.js';

const SOURCE = 'langsys-js-react';
const TARGETS = new Set(['Translate', 'Phrase']);
const VERBATIM = 'DontTranslate';
const EXPLICIT = /%([A-Za-z_][A-Za-z0-9_]*)%/g;

export interface LangsysTransformMetadata {
    /** One entry per unnameable expression: where it is, and the name it was given. */
    warnings: Array<{ line: number | null; column: number | null; source: string; name: string }>;
    /** How many units were rewritten. */
    rewritten: number;
}

interface State extends PluginPass {
    targets: Set<string>;
    verbatim: Set<string>;
    hooks: Set<string>;
    tNames: Set<string>;
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

    /** Names already written explicitly as `%name%` in static text, or as keys of a params literal. */
    const explicitNames = (texts: string[], params: t.Expression | null): Set<string> => {
        const out = new Set<string>();
        for (const s of texts) for (const m of s.matchAll(EXPLICIT)) out.add(m[1]);
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
     * Whether a host element's subtree is not translated, as the core decides it from the rendered
     * attributes (`isTranslationExcluded`): `translate` equal to `no` in any case, or `data-notrans`
     * present and not `false` / `0`. An attribute whose value is an expression is not known here.
     */
    const excludes = (opening: t.JSXOpeningElement): boolean =>
        opening.attributes.some((a) => {
            if (a.type !== 'JSXAttribute' || a.name.type !== 'JSXIdentifier') return false;
            const text = attributeText(a);
            if (text === undefined) return false;
            if (a.name.name === 'translate') return text.toLowerCase() === 'no';
            if (a.name.name === 'data-notrans') return !['false', '0'].includes(text.trim().toLowerCase());
            return false;
        });

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
            marked: boolean;
            replace: (name: string) => void;
        }> = [];
        const texts: string[] = [];

        /** `verbatim`: inside a subtree that is not translated, where a value is marked, not replaced. */
        const walk = (children: t.JSXElement['children'], verbatim: boolean) => {
            children.forEach((c, i) => {
                if (c.type === 'JSXText') {
                    texts.push(c.value);
                } else if (c.type === 'JSXExpressionContainer') {
                    const e = c.expression;
                    if (e.type === 'JSXEmptyExpression') return;
                    if (e.type === 'StringLiteral' || e.type === 'NumericLiteral') {
                        children[i] = T.jsxText(String(e.value));
                        return;
                    }
                    if (
                        e.type === 'JSXElement' ||
                        e.type === 'JSXFragment' ||
                        e.type === 'LogicalExpression' ||
                        e.type === 'ConditionalExpression'
                    ) {
                        return;
                    }
                    found.push({
                        source: sourceOf(state, e),
                        expression: e,
                        marked: verbatim,
                        replace: (name) => {
                            children[i] = verbatim ? marker(name, e) : T.jsxText(`%${name}%`);
                        },
                    });
                } else if (c.type === 'JSXElement') {
                    const n = c.openingElement.name;
                    if (n.type !== 'JSXIdentifier') return;
                    if (/^[a-z]/.test(n.name)) {
                        if (!marks(c.openingElement)) walk(c.children, verbatim || excludes(c.openingElement));
                    }
                    else if (state.verbatim.has(n.name)) walk(c.children, true);
                } else if (c.type === 'JSXFragment') {
                    walk(c.children, verbatim);
                }
            });
        };
        walk(path.node.children, false);
        if (!found.length) return;

        const attrs = path.node.openingElement.attributes;
        const existing = attrs.find(
            (a): a is t.JSXAttribute => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'params',
        );
        const existingExpr =
            existing?.value?.type === 'JSXExpressionContainer' && existing.value.expression.type !== 'JSXEmptyExpression'
                ? existing.value.expression
                : null;

        const named = nameAll(found, explicitNames(texts, existingExpr));
        found.forEach((f, i) => f.replace(named[i].name));
        placeholders(named).forEach((n) => warn(state, n));
        // A marked value carries itself; only a replaced one travels as a param.
        const params = placeholders(named.filter((_, i) => !found[i].marked));

        if (params.length) {
            const value = T.jsxExpressionContainer(mergeParams(existingExpr, params));
            if (existing) existing.value = value;
            else attrs.push(T.jsxAttribute(T.jsxIdentifier('params'), value));
        }
        state.meta.rewritten++;
    }

    // ---- t() calls -----------------------------------------------------------------------------

    /** The pieces of a template literal or a `+` chain holding at least one string, in order. */
    function pieces(node: t.Node): Array<string | t.Expression> | null {
        if (node.type === 'TemplateLiteral') {
            const out: Array<string | t.Expression> = [];
            node.quasis.forEach((q, i) => {
                if (q.value.cooked) out.push(q.value.cooked);
                if (i < node.expressions.length) out.push(node.expressions[i] as t.Expression);
            });
            return node.expressions.length ? out : null;
        }
        if (node.type === 'BinaryExpression' && node.operator === '+') {
            const flat: Array<string | t.Expression> = [];
            const visit = (n: t.Node) => {
                if (n.type === 'BinaryExpression' && n.operator === '+') {
                    visit(n.left);
                    visit(n.right);
                } else if (n.type === 'StringLiteral') flat.push(n.value);
                else if (n.type === 'TemplateLiteral' && !n.expressions.length) flat.push(n.quasis[0].value.cooked ?? '');
                else flat.push(n as t.Expression);
            };
            visit(node);
            const hasString = flat.some((p) => typeof p === 'string');
            const hasValue = flat.some((p) => typeof p !== 'string');
            return hasString && hasValue ? flat : null;
        }
        return null;
    }

    function rewriteCall(path: NodePath<t.CallExpression>, state: State) {
        const [phrase, category, params] = path.node.arguments;
        if (!phrase || phrase.type === 'SpreadElement' || phrase.type === 'ArgumentPlaceholder') return;
        const parts = pieces(phrase);
        if (!parts) return;
        if (params && params.type === 'SpreadElement') return;

        const values = parts
            .filter((p): p is t.Expression => typeof p !== 'string')
            .map((e) => ({ source: sourceOf(state, e), expression: e }));
        const paramsExpr = (params as t.Expression | undefined) ?? null;
        const named = nameAll(values, explicitNames([], paramsExpr));
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

    return {
        name: 'langsys-placeholders',
        pre(file) {
            this.meta = { warnings: [], rewritten: 0 };
            (file.metadata as unknown as { langsys: LangsysTransformMetadata }).langsys = this.meta;
            this.targets = new Set();
            this.hooks = new Set();
            this.tNames = new Set();
            this.verbatim = new Set();
        },
        visitor: {
            Program(program, state) {
                for (const stmt of program.node.body) {
                    if (stmt.type !== 'ImportDeclaration' || stmt.source.value !== SOURCE) continue;
                    for (const s of stmt.specifiers) {
                        if (s.type !== 'ImportSpecifier') continue;
                        const imported = s.imported.type === 'Identifier' ? s.imported.name : s.imported.value;
                        if (TARGETS.has(imported)) state.targets.add(s.local.name);
                        if (imported === 'useT') state.hooks.add(s.local.name);
                        if (imported === VERBATIM) state.verbatim.add(s.local.name);
                    }
                }
                if (!state.targets.size && !state.hooks.size) return;
                // `const t = useT()` binds a translation function.
                program.traverse({
                    VariableDeclarator(d) {
                        const init = d.node.init;
                        if (
                            d.node.id.type === 'Identifier' &&
                            init?.type === 'CallExpression' &&
                            init.callee.type === 'Identifier' &&
                            state.hooks.has(init.callee.name)
                        ) {
                            state.tNames.add(d.node.id.name);
                        }
                    },
                });
            },
            JSXElement(path, state) {
                const n = path.node.openingElement.name;
                if (n.type === 'JSXIdentifier' && state.targets.has(n.name)) rewriteTarget(path, state);
            },
            CallExpression(path, state) {
                const callee = path.node.callee;
                const isT =
                    (callee.type === 'Identifier' && state.tNames.has(callee.name)) ||
                    (callee.type === 'CallExpression' &&
                        callee.callee.type === 'Identifier' &&
                        state.hooks.has(callee.callee.name));
                if (isT) rewriteCall(path, state);
            },
        },
    };
}
