/**
 * VAR-2 placeholder naming, row by row from the spec's table. The shared naming vectors
 * (`var-naming-vectors.json`, authored by the JS core) run here too once the core ships them.
 */
import { parseSync } from '@babel/core';
import { describe, expect, it } from 'vitest';
import type { types as t } from '@babel/core';
import { nameAll, snakeCase } from './naming.js';

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
        expect(names(['user.name', 'user.name'])).toEqual(['name']);
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
        expect(snakeCase('userID')).toBe('user_id');
        expect(snakeCase('URLPath')).toBe('url_path');
    });
});
