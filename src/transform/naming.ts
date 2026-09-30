/**
 * Placeholder names for interpolated expressions (spec VAR-2).
 *
 * The names are the core's: `derivePlaceholderNames` decides them for every SDK from each
 * expression's shape, so the same expression gets the same name everywhere. This module only maps
 * a Babel expression onto that shape:
 *
 * - an identifier → `{ identifier }`
 * - a member chain (optional or not, type wrappers ignored) → `{ member: [segments] }`
 * - a call → `{ call: { callee, args: [shapes] } }` (the core names one with a single argument)
 * - a computed member, a binary, logical or conditional expression, a template literal, a call
 *   with a spread argument, anything else → `{ other }`
 *
 * A name the developer wrote explicitly elsewhere in the phrase — a `%name%` in its text, a key of
 * its `params` — is passed to the core as taken, so a derived name avoids it.
 */
import type { types as t } from '@babel/core';
import { derivePlaceholderNames, type ExpressionShape } from 'langsys-js-typescript/pure';

/** An expression with type-only wrappers removed. */
function unwrap(e: t.Node): t.Node {
    let n = e;
    while (
        n.type === 'TSAsExpression' ||
        n.type === 'TSNonNullExpression' ||
        n.type === 'TSSatisfiesExpression' ||
        n.type === 'TSTypeAssertion' ||
        n.type === 'ParenthesizedExpression'
    ) {
        n = n.expression;
    }
    return n;
}

/** The static segments of a member chain; null when any segment is computed. */
function segments(e: t.Node): string[] | null {
    const n = unwrap(e);
    if (n.type === 'Identifier') return [n.name];
    if (n.type === 'ThisExpression') return [];
    if (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') {
        if (n.computed || n.property.type !== 'Identifier') return null;
        const head = segments(n.object);
        return head ? [...head, n.property.name] : null;
    }
    return null;
}

/** The shape of an expression, as the core's naming reads it. */
export function shapeOf(e: t.Node): ExpressionShape {
    const n = unwrap(e);
    if (n.type === 'Identifier') return { identifier: n.name };
    if (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') {
        const segs = segments(n);
        return segs && segs.length ? { member: segs } : { other: 'computed' };
    }
    if (n.type === 'CallExpression' || n.type === 'OptionalCallExpression') {
        const args = n.arguments;
        if (args.some((x) => x.type === 'SpreadElement' || x.type === 'ArgumentPlaceholder')) return { other: 'call-multi' };
        const callee = segments(n.callee);
        return { call: { callee: callee ? callee.join('.') : 'call', args: args.map((x) => shapeOf(x)) } };
    }
    if (n.type === 'BinaryExpression' || n.type === 'LogicalExpression') return { other: 'binary' };
    if (n.type === 'ConditionalExpression') return { other: 'conditional' };
    if (n.type === 'TemplateLiteral') return { other: 'template' };
    return { other: n.type };
}

/** Whether the core can derive a name from this shape rather than numbering it `value`. */
function derivable(shape: ExpressionShape): boolean {
    if ('identifier' in shape || 'member' in shape) return true;
    if ('call' in shape) return shape.call.args.length === 1 && derivable(shape.call.args[0]);
    return false;
}

export interface Named {
    /** The expression's source text; the same text is the same placeholder. */
    source: string;
    expression: t.Expression;
    name: string;
    /** True when no name could be derived and the core numbered it `value`. */
    unnameable: boolean;
}

/**
 * Name the values of one phrase, in order, index-aligned with `expressions`. `taken` holds names
 * the developer wrote explicitly in the same phrase.
 */
export function nameAll(
    expressions: Array<{ source: string; expression: t.Expression }>,
    taken: Iterable<string> = [],
): Named[] {
    const explicit = [...taken];
    const shapes = expressions.map((x) => shapeOf(x.expression));
    const names = derivePlaceholderNames([
        ...explicit.map((name) => ({ shape: { other: 'explicit' } as ExpressionShape, explicit: name })),
        ...shapes.map((shape) => ({ shape })),
    ]).slice(explicit.length);
    return expressions.map((x, i) => ({ ...x, name: names[i], unnameable: !derivable(shapes[i]) }));
}
