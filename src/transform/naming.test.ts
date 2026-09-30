/**
 * VAR-2 placeholder naming. The names are the core's (`derivePlaceholderNames`); this binding maps
 * Babel expressions onto the core's expression shapes. The shared vectors
 * (`var-naming-vectors.json`, authored by the JS core, vendored byte-exact) check both: each
 * case's source maps to the case's shape, and the names come out as the case expects.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSync } from '@babel/core';
import { describe, expect, it } from 'vitest';
import type { types as t } from '@babel/core';
import { derivePlaceholderNames, type ExpressionShape } from 'langsys-js-typescript/pure';
import { nameAll, shapeOf } from './naming.js';

const VECTORS = readFileSync(resolve(__dirname, '../../vectors/var-naming-vectors.json'));
const VECTORS_BLOB = 'a4b61ed248118338269ee870c920ee2c77549edf';
type Case = { id: string; expressions: Array<{ source: string; shape: ExpressionShape; explicit?: string }>; names: string[] };
const cases = (JSON.parse(VECTORS.toString('utf8')) as { cases: Case[] }).cases;

describe('the shared naming vectors', () => {
    it('are the core-authored file, byte for byte', () => {
        const blob = createHash('sha1').update(`blob ${VECTORS.length}\0`).update(VECTORS).digest('hex');
        expect(blob).toBe(VECTORS_BLOB);
        expect(cases).toHaveLength(27);
    });

    it.each(cases.map((c) => [c.id, c] as const))('%s: each source maps to its shape, and names as expected', (_id, c) => {
        const shapes = c.expressions.map((e) => shapeOf(expr(e.source).expression));
        expect(shapes).toEqual(c.expressions.map((e) => e.shape));
        const names = derivePlaceholderNames(c.expressions.map((e, i) => ({ shape: shapes[i], explicit: e.explicit })));
        expect(names).toEqual(c.names);
    });
});

const expr = (src: string) => {
    const file = parseSync(`(${src});`, { filename: 'x.ts', babelrc: false, configFile: false, parserOpts: { plugins: ['typescript'] } });
    const stmt = file!.program.body[0] as t.ExpressionStatement;
    return { source: src, expression: stmt.expression };
};
const names = (srcs: string[], taken: string[] = []) => nameAll(srcs.map(expr), taken).map((n) => n.name);

describe('VAR-2 naming', () => {
    it.each([
        ['an identifier, in snake_case', 'firstName', 'first_name'],
        ['an identifier already lowercase', 'name', 'name'],
        ['a member chain: its last segment', 'user.name', 'name'],
        ['a deep chain', 'order.customer.firstName', 'first_name'],
        ['optional chaining', 'user?.name', 'name'],
        ['length: previous segment + _count', 'items.length', 'items_count'],
        ['size', 'cart.lines.size', 'lines_count'],
        ['count', 'inbox.count', 'inbox_count'],
        ['value: the previous segment', 'price.value', 'price'],
        ['current: the previous segment', 'inputRef.current', 'input_ref'],
        ['a call with one argument: the argument', 'formatDate(order.date)', 'date'],
        ['a method call with one argument', 'fmt.currency(total)', 'total'],
        ['type-only wrappers are ignored', 'user!.name as string', 'name'],
    ])('%s: %s → %s', (_row, src, expected) => {
        expect(names([src])).toEqual([expected]);
    });

    it.each([
        ['a binary expression', 'a + b'],
        ['a conditional', 'ok ? x : y'],
        ['a template literal', '`${a}b`'],
        ['a computed member', 'items[0]'],
        ['a call with several arguments', 'format(a, b)'],
        ['a call with none', 'now()'],
    ])('%s is unnameable: value', (_row, src) => {
        const [n] = nameAll([expr(src)]);
        expect(n.name).toBe('value');
        expect(n.unnameable).toBe(true);
    });

    it('unnameable expressions number value, value_2, …', () => {
        expect(names(['a + b', 'c ? d : e', 'f(g, h)'])).toEqual(['value', 'value_2', 'value_3']);
    });

    it('a name several expressions share is prefixed with each previous segment', () => {
        expect(names(['a.name', 'b.name'])).toEqual(['a_name', 'b_name']);
    });

    it('what still collides after the prefix is suffixed _2', () => {
        expect(names(['name', 'user.name'])).toEqual(['name', 'user_name']);
        expect(names(['x.a.name', 'y.a.name'])).toEqual(['a_name', 'a_name_2']);
    });

    it('the same expression twice is one placeholder', () => {
        expect(names(['user.name', 'user.name'])).toEqual(['name', 'name']);
    });

    it('a name the developer wrote explicitly wins', () => {
        expect(names(['user.name'], ['name'])).toEqual(['user_name']);
        expect(names(['name'], ['name'])).toEqual(['name_2']);
    });

    it('the <Phrase> markup tokens m<N>o / m<N>c are never produced', () => {
        expect(names(['m0o'])).toEqual(['m0o_2']);
        expect(names(['row.m1c'])).toEqual(['row_m1c']);
    });

    it('every derived name matches [a-z][a-z0-9_]*', () => {
        for (const n of names(['userID', 'URLPath', '_private', 'a$b', 'x.HTMLElement'])) {
            expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
        }
    });
});
