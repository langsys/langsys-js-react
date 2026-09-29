/**
 * Placeholder names for interpolated expressions (spec VAR-2).
 *
 * A name matches `[a-z][a-z0-9_]*` and is derived from the expression that produced the value:
 *
 * - an identifier: itself, in snake_case (`firstName` → `first_name`)
 * - a member chain: its last segment (`user.name` → `name`)
 * - a chain ending in `length`, `size` or `count`: the previous segment plus `_count`
 *   (`items.length` → `items_count`)
 * - a chain ending in `value` or `current`: the previous segment (`price.value` → `price`)
 * - a call with one argument: the argument's name (`formatDate(order.date)` → `date`)
 * - anything else: unnameable — `value`, `value_2`, …, with a build warning
 *
 * Within one phrase, a name several different expressions derive is prefixed with each one's
 * previous segment (`a.name`, `b.name` → `a_name`, `b_name`), and whatever still collides is
 * suffixed `_2`, `_3`. The same expression twice is one placeholder. `m<N>o` / `m<N>c` are the
 * `<Phrase>` markup tokens and are never produced. A name the developer wrote explicitly — a
 * `%name%` with its param — is taken, and a derived name avoids it.
 */
import type { types as t } from '@babel/core';

const COUNT = new Set(['length', 'size', 'count']);
const PASS_THROUGH = new Set(['value', 'current']);
const RESERVED = /^m\d+[oc]$/;
const VALID = /^[a-z][a-z0-9_]*$/;

/** `firstName` → `first_name`, `userID` → `user_id`; null when nothing valid remains. */
export function snakeCase(name: string): string | null {
    const out = name
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return VALID.test(out) ? out : null;
}

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

/** The static segments of a member chain, outermost last; null when any segment is computed. */
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

/** What a derived name is, before collisions: the name, and the segment a collision prefixes. */
export interface BaseName {
    name: string | null;
    previous: string | null;
}

export function baseName(e: t.Node): BaseName {
    const n = unwrap(e);
    if (n.type === 'CallExpression' || n.type === 'OptionalCallExpression') {
        const args = n.arguments;
        if (args.length === 1 && args[0].type !== 'SpreadElement' && args[0].type !== 'ArgumentPlaceholder') {
            return baseName(args[0]);
        }
        return { name: null, previous: null };
    }
    const segs = segments(n);
    if (!segs || segs.length === 0) return { name: null, previous: null };
    const last = segs[segs.length - 1];
    const prev = segs.length > 1 ? segs[segs.length - 2] : null;
    const prevPrev = segs.length > 2 ? segs[segs.length - 3] : null;
    if (segs.length > 1 && COUNT.has(last)) {
        const p = prev && snakeCase(prev);
        return { name: p ? `${p}_count` : null, previous: prevPrev && snakeCase(prevPrev) };
    }
    if (segs.length > 1 && PASS_THROUGH.has(last)) {
        return { name: prev && snakeCase(prev), previous: prevPrev && snakeCase(prevPrev) };
    }
    return { name: snakeCase(last), previous: prev && snakeCase(prev) };
}

export interface Named {
    /** The expression's source text, the key that makes the same expression one placeholder. */
    source: string;
    expression: t.Expression;
    name: string;
    /** True when no name could be derived and a `value` name was assigned. */
    unnameable: boolean;
}

/**
 * Name every distinct expression of one phrase, in first-appearance order. `taken` holds names the
 * developer wrote explicitly in the same phrase.
 */
export function nameAll(
    expressions: Array<{ source: string; expression: t.Expression }>,
    taken: Iterable<string> = [],
): Named[] {
    const distinct: Array<{ source: string; expression: t.Expression; base: BaseName }> = [];
    const seen = new Set<string>();
    for (const x of expressions) {
        if (seen.has(x.source)) continue;
        seen.add(x.source);
        distinct.push({ ...x, base: baseName(x.expression) });
    }

    const reserved = new Set(taken);
    const counts = new Map<string, number>();
    for (const d of distinct) {
        const n = d.base.name;
        if (n && !RESERVED.test(n)) counts.set(n, (counts.get(n) ?? 0) + 1);
    }

    // First pass: a name several expressions share, or one the developer took, is prefixed with
    // each expression's previous segment where it has one.
    const first = distinct.map((d) => {
        const n = d.base.name;
        if (!n) return null;
        const clash = RESERVED.test(n) || reserved.has(n) || (counts.get(n) ?? 0) > 1;
        if (!clash) return n;
        return d.base.previous ? `${d.base.previous}_${n}` : n;
    });

    // Second pass: suffix whatever still collides, then name the unnameable.
    const used = new Set(reserved);
    const out: Named[] = [];
    let values = 0;
    distinct.forEach((d, i) => {
        let name = first[i];
        let unnameable = false;
        if (!name) {
            unnameable = true;
            do {
                values++;
                name = values === 1 ? 'value' : `value_${values}`;
            } while (used.has(name));
        } else if (used.has(name) || RESERVED.test(name)) {
            const base = name;
            let k = 2;
            while (used.has(`${base}_${k}`)) k++;
            name = `${base}_${k}`;
        }
        used.add(name);
        out.push({ source: d.source, expression: d.expression, name, unnameable });
    });
    return out;
}
