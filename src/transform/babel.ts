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
 * Only `<Translate>` and `<Phrase>` imported from `langsys-js-react` are rewritten, and only the
 * children a host element renders as text: an expression inside a nested host element (`<b>{x}</b>`)
 * is included; one that is itself JSX, a conditional, or sits inside a component or a nested
 * `<Translate>` / `<Phrase>` is left alone. String and number literals (`{' '}`, `{3}`) are static
 * text and are inlined. `t()` calls are rewritten where `t` comes from `useT()`. Names follow VAR-2
 * (`./naming`); an expression no name can be derived from is named `value`, `value_2`, … and
 * reported in `file.metadata.langsys.warnings`, which the Vite plugin and the Next loader surface as
 * build warnings.
 */
import type { NodePath, PluginObj, PluginPass, types as t } from '@babel/core';
import { nameAll, type Named } from './naming.js';

const SOURCE = 'langsys-js-react';
const TARGETS = new Set(['Translate', 'Phrase']);
const EXPLICIT = /%([A-Za-z_][A-Za-z0-9_]*)%/g;

export interface LangsysTransformMetadata {
    /** One entry per unnameable expression: where it is, and the name it was given. */
    warnings: Array<{ line: number | null; column: number | null; source: string; name: string }>;
    /** How many units were rewritten. */
    rewritten: number;
}

interface State extends PluginPass {
    targets: Set<string>;
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

    /** One entry per expression: the same expression twice is one placeholder and one param. */
    const distinct = (named: Named[]): Named[] => {
        const seen = new Set<string>();
        return named.filter((n) => !seen.has(n.source) && seen.add(n.source));
    };

    const mergeParams = (existing: t.Expression | null, named: Named[]): t.Expression => {
        const props = named.map((n) => T.objectProperty(T.identifier(n.name), n.expression));
        if (!existing) return T.objectExpression(props);
        if (existing.type === 'ObjectExpression') return T.objectExpression([...existing.properties, ...props]);
        return T.objectExpression([T.spreadElement(existing), ...props]);
    };

    // ---- JSX: <Translate> / <Phrase> children --------------------------------------------------

    function rewriteTarget(path: NodePath<t.JSXElement>, state: State) {
        const found: Array<{ source: string; expression: t.Expression; replace: (text: string) => void }> = [];
        const texts: string[] = [];

        const walk = (children: t.JSXElement['children']) => {
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
                        replace: (text) => {
                            children[i] = T.jsxText(text);
                        },
                    });
                } else if (c.type === 'JSXElement') {
                    const n = c.openingElement.name;
                    if (n.type === 'JSXIdentifier' && /^[a-z]/.test(n.name)) walk(c.children);
                } else if (c.type === 'JSXFragment') {
                    walk(c.children);
                }
            });
        };
        walk(path.node.children);
        if (!found.length) return;

        const attrs = path.node.openingElement.attributes;
        const existing = attrs.find(
            (a): a is t.JSXAttribute => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'params',
        );
        const existingExpr =
            existing?.value?.type === 'JSXExpressionContainer' && existing.value.expression.type !== 'JSXEmptyExpression'
                ? existing.value.expression
                : null;

        const named = distinct(nameAll(found, explicitNames(texts, existingExpr)));
        const bySource = new Map(named.map((n) => [n.source, n]));
        for (const f of found) f.replace(`%${bySource.get(f.source)!.name}%`);
        named.forEach((n) => warn(state, n));

        const value = T.jsxExpressionContainer(mergeParams(existingExpr, named));
        if (existing) existing.value = value;
        else attrs.push(T.jsxAttribute(T.jsxIdentifier('params'), value));
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
        const named = distinct(nameAll(values, explicitNames([], paramsExpr)));
        const bySource = new Map(named.map((n) => [n.source, n.name]));
        const text = parts.map((p) => (typeof p === 'string' ? p : `{${bySource.get(sourceOf(state, p))}}`)).join('');
        named.forEach((n) => warn(state, n));

        path.node.arguments = [
            T.stringLiteral(text),
            (category as t.Expression | undefined) ?? T.identifier('undefined'),
            mergeParams(paramsExpr, named),
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
