/**
 * The placeholder transform's output (spec VAR-6), on source as an app writes it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSync, transformSync, traverse, type NodePath, type types as t } from '@babel/core';
import { describe, expect, it } from 'vitest';
import langsysPlaceholders, { type LangsysTransformMetadata } from './babel.js';

function run(code: string): { code: string; meta: LangsysTransformMetadata } {
    const out = transformSync(code, {
        filename: 'App.tsx',
        babelrc: false,
        configFile: false,
        plugins: [langsysPlaceholders],
        parserOpts: { plugins: ['jsx', 'typescript'] },
        generatorOpts: { compact: false },
    });
    return {
        code: out!.code!.replace(/\s+/g, ' '),
        meta: (out!.metadata as unknown as { langsys: LangsysTransformMetadata }).langsys,
    };
}

const IMPORT = "import { Translate, Phrase, useT } from 'langsys-js-react';\n";

describe('<Translate> and <Phrase> children', () => {
    it('an interpolation becomes a placeholder, and its value a param', () => {
        const { code } = run(IMPORT + 'const A = ({ user }) => <Translate category="UI">Hello {user.name}</Translate>;');
        expect(code).toContain('<Translate category="UI" params={{ name: user.name }}>Hello %name%</Translate>');
    });

    it('names follow VAR-2: a count, collisions, and the same expression once', () => {
        const { code } = run(
            IMPORT + 'const A = ({ a, b, items }) => <Translate>{a.name} and {b.name} have {items.length} items, {a.name}</Translate>;',
        );
        expect(code).toContain('params={{ a_name: a.name, b_name: b.name, items_count: items.length }}');
        expect(code).toContain('%a_name% and %b_name% have %items_count% items, %a_name%');
    });

    it('inside nested host elements too, in a <Phrase>', () => {
        const { code } = run(IMPORT + 'const A = ({ name }) => <Phrase category="UI">Hello <b>{name}</b>!</Phrase>;');
        expect(code).toContain('<Phrase category="UI" params={{ name: name }}>Hello <b>%name%</b>!</Phrase>');
    });

    it('string and number literals are static text', () => {
        const { code } = run(IMPORT + "const A = () => <Translate>Hello{' '}<b>world</b> {3} times</Translate>;");
        expect(code).toContain('Hello <b>world</b> 3 times');
        expect(code).not.toContain('params');
    });

    it('existing params are kept, and an explicit %name% wins', () => {
        const { code } = run(
            IMPORT + 'const A = ({ n, user }) => <Translate params={{ name: n }}>Hi %name%, from {user.name}</Translate>;',
        );
        expect(code).toContain('params={{ name: n, user_name: user.name }}');
        expect(code).toContain('Hi %name%, from %user_name%');
    });

    it('JSX, conditionals and components inside are left alone', () => {
        const { code } = run(
            IMPORT + 'const A = ({ ok, name }) => <Translate>Hi {ok && <i>!</i>}{ok ? <b>a</b> : null}<Badge>{name}</Badge></Translate>;',
        );
        expect(code).not.toContain('params');
        expect(code).toContain('<Badge>{name}</Badge>');
    });

    it('a nested <Translate> is rewritten on its own', () => {
        const { code } = run(IMPORT + 'const A = ({ a, b }) => <Translate>{a} <Translate>{b}</Translate></Translate>;');
        expect(code).toContain('<Translate params={{ a: a }}>%a% <Translate params={{ b: b }}>%b%</Translate></Translate>');
    });

    it('a component named Translate from another package is not touched', () => {
        const { code, meta } = run("import { Translate } from 'other-i18n';\nconst A = ({ n }) => <Translate>Hi {n}</Translate>;");
        expect(code).toContain('<Translate>Hi {n}</Translate>');
        expect(meta.rewritten).toBe(0);
    });

    it('an unnameable expression is named value and reported as a build warning', () => {
        const { code, meta } = run(IMPORT + 'const A = ({ a, b }) => <Translate>Total {a + b}</Translate>;');
        expect(code).toContain('params={{ value: a + b }}>Total %value%');
        expect(meta.warnings).toEqual([{ line: 2, column: 42, source: 'a + b', name: 'value' }]);
    });

    it('an unnameable expression written twice is two placeholders and two params; a self-naming one is one', () => {
        const { code, meta } = run(IMPORT + 'const A = ({ a, b, user }) => <Translate>{user.name}: {a + b} and {a + b}, {user.name}</Translate>;');
        expect(code).toContain('params={{ name: user.name, value: a + b, value_2: a + b }}>%name%: %value% and %value_2%, %name%');
        expect(meta.warnings.map((w) => w.name)).toEqual(['value', 'value_2']);
    });

    it('two unnameable values are two placeholders and two params, even of the same kind', () => {
        const { code } = run(IMPORT + 'const A = ({ a, b, c, d }) => <Translate>Sum {a + b}, product {c * d}</Translate>;');
        expect(code).toContain('params={{ value: a + b, value_2: c * d }}>Sum %value%, product %value_2%');
    });
});

describe('a value in a subtree that is not translated', () => {
    const DNT = "import { Translate, Phrase, DontTranslate } from 'langsys-js-react';\n";

    it('is marked where it is, in both components, and travels as no param', () => {
        const { code } = run(
            DNT +
                'const A = ({ user }) => <Phrase>Signed in as <DontTranslate>{user.email}</DontTranslate></Phrase>;\n' +
                'const B = ({ user }) => <Translate>Signed in as <DontTranslate>{user.email}</DontTranslate></Translate>;',
        );
        expect(code).toContain(
            '<Phrase>Signed in as <DontTranslate><span data-ls-param="email">{user.email}</span></DontTranslate></Phrase>',
        );
        expect(code).toContain(
            '<Translate>Signed in as <DontTranslate><span data-ls-param="email">{user.email}</span></DontTranslate></Translate>',
        );
        expect(code).not.toContain('params');
    });

    it('beside a replaced value, named in one sequence: only the replaced one is a param', () => {
        // `user.name` and `a.name` collide on `name` across the two forms, so both are qualified.
        const { code } = run(
            DNT + 'const A = ({ user, a }) => <Phrase>Hi {user.name}, <DontTranslate>{a.name} {user.name}</DontTranslate></Phrase>;',
        );
        expect(code).toContain('<Phrase params={{ user_name: user.name }}>Hi %user_name%, <DontTranslate>');
        expect(code).toContain(
            '<span data-ls-param="a_name">{a.name}</span> <span data-ls-param="user_name">{user.name}</span>',
        );
    });

    it('inside any element of the subtree, and under a host element that opts out the way the core reads it', () => {
        const { code } = run(
            DNT +
                'const A = ({ a, b, c, d, e }) => <Translate><DontTranslate><b>{a}</b></DontTranslate>' +
                '<span translate="no">{b}</span><span translate="NO">{c}</span><span data-notrans>{d}</span>' +
                '<span data-notrans="yes">{e}</span></Translate>;',
        );
        for (const n of ['a', 'b', 'c', 'd', 'e']) expect(code).toContain(`<span data-ls-param="${n}">{${n}}</span>`);
        expect(code).not.toContain('params');
    });

    it('an attribute that does not opt out, or is only known at runtime, leaves the value a param', () => {
        const { code } = run(
            DNT +
                'const A = ({ a, b, c, x }) => <Translate><span data-notrans="false">{a}</span>' +
                '<span data-notrans=" 0 ">{b}</span><span translate={x}>{c}</span></Translate>;',
        );
        expect(code).toContain('params={{ a: a, b: b, c: c }}');
        expect(code).not.toContain('data-ls-param');
    });

    it('a value already marked is left alone, and DontTranslate is recognised under another name only from this package', () => {
        const { code } = run(
            "import { Phrase, DontTranslate as Keep } from 'langsys-js-react';\n" +
                "import { DontTranslate } from 'elsewhere';\n" +
                'const A = ({ a, b, c }) => <Phrase><span data-ls-param="who">{a}</span> <Keep>{b}</Keep> <DontTranslate>{c}</DontTranslate></Phrase>;',
        );
        expect(code).toContain('<span data-ls-param="who">{a}</span> <Keep><span data-ls-param="b">{b}</span></Keep>');
        expect(code).toContain('<DontTranslate>{c}</DontTranslate>');
        expect(code).not.toContain('params');
    });
});

describe('t() calls', () => {
    it('a template literal becomes a phrase with placeholders and params', () => {
        const { code } = run(IMPORT + 'function A({ items }) { const t = useT(); return t(`You have ${items.length} items`, "Cart"); }');
        expect(code).toContain('t("You have {items_count} items", "Cart", { items_count: items.length })');
    });

    it('string concatenation too, with no category', () => {
        const { code } = run(IMPORT + "function A({ user }) { const t = useT(); return t('Hello ' + user.firstName + '!'); }");
        expect(code).toContain('t("Hello {first_name}!", undefined, { first_name: user.firstName })');
    });

    it('two calls on unnameable arguments are two placeholders and two params', () => {
        const { code } = run(IMPORT + 'function A({ a, b, c, d }) { const t = useT(); return t(`${fmt(a + b)} of ${fmt(c * d)}`, "UI"); }');
        expect(code).toContain('t("{value} of {value_2}", "UI", { value: fmt(a + b), value_2: fmt(c * d) })');
    });

    it('an unnameable expression repeated in a template is two placeholders too', () => {
        const { code } = run(IMPORT + 'function A({ a, b }) { const t = useT(); return t(`${a + b} and ${a + b}`, "UI"); }');
        expect(code).toContain('t("{value} and {value_2}", "UI", { value: a + b, value_2: a + b })');
    });

    it('existing params are merged', () => {
        const { code } = run(IMPORT + 'function A({ n, d }) { const t = useT(); return t(`${n} due`, "UI", { when: d }); }');
        expect(code).toContain('t("{n} due", "UI", { when: d, n: n })');
    });

    it('a plain phrase is untouched', () => {
        const { code, meta } = run(IMPORT + "function A() { const t = useT(); return t('Hello {name}', 'UI', { name: 'x' }); }");
        expect(code).toContain("t('Hello {name}', 'UI', { name: 'x' })");
        expect(meta.rewritten).toBe(0);
    });

    it('a function not from useT() is untouched', () => {
        const { code } = run(IMPORT + 'function A({ n }) { const t = (s) => s; return t(`x ${n}`); }');
        expect(code).toContain('t(`x ${n}`)');
    });
});

describe('every shared naming vector, through the transform', () => {
    // Explicit names reach the transform as `%name%` or `params` keys, covered above; the rest are
    // written as an app writes them, each expression in turn, and the placeholders come out as the
    // vector names them, with one param per distinct name.
    type Case = { id: string; expressions: Array<{ source: string; explicit?: string }>; names: string[] };
    const vectors = JSON.parse(readFileSync(resolve(__dirname, '../../vectors/var-naming-vectors.json'), 'utf8')) as { cases: Case[] };
    const cases = vectors.cases.filter((c) => c.expressions.every((e) => !e.explicit));
    // In JSX children a conditional or a logical expression is left alone by design, since it
    // usually chooses between elements; in a t() template it is a value like any other.
    const kept = (source: string) => {
        const expr = (parseSync(`(${source});`, { filename: 'x.ts', babelrc: false, configFile: false })!.program.body[0] as t.ExpressionStatement).expression;
        return expr.type !== 'ConditionalExpression' && expr.type !== 'LogicalExpression';
    };
    const jsxCases = cases.filter((c) => c.expressions.every((e) => kept(e.source)));

    /** The keys of the object literal passed as params, in order. */
    function paramKeys(code: string, find: (path: NodePath) => t.ObjectExpression | null): string[] {
        const ast = parseSync(code, { filename: 'out.tsx', babelrc: false, configFile: false, parserOpts: { plugins: ['jsx', 'typescript'] } })!;
        let keys: string[] = [];
        traverse(ast, {
            enter(path) {
                const obj = find(path);
                if (obj) keys = obj.properties.map((p) => ((p as t.ObjectProperty).key as t.Identifier).name);
            },
        });
        return keys;
    }
    const unique = (names: string[]) => [...new Set(names)];

    it('covers the cases', () => {
        expect(cases.length).toBeGreaterThan(25);
        expect(cases.length - jsxCases.length).toBe(2);
    });

    it.each(jsxCases.map((c) => [c.id, c] as const))('%s, in <Translate> children', (_id, c) => {
        const { code } = run(IMPORT + `const A = (p) => <Translate>${c.expressions.map((e) => `{${e.source}}`).join(' | ')}</Translate>;`);
        expect(code).toContain(`>${c.names.map((n) => `%${n}%`).join(' | ')}</Translate>`);
        const keys = paramKeys(code, (path) =>
            path.isJSXAttribute() && path.node.name.name === 'params' && path.node.value?.type === 'JSXExpressionContainer'
                ? (path.node.value.expression as t.ObjectExpression)
                : null,
        );
        expect(keys).toEqual(unique(c.names));
    });

    it.each(cases.map((c) => [c.id, c] as const))('%s, in a t() template', (_id, c) => {
        const { code } = run(IMPORT + `function A(p) { const t = useT(); return t(\`${c.expressions.map((e) => `\${${e.source}}`).join(' | ')}\`, "UI"); }`);
        expect(code).toContain(`t(${JSON.stringify(c.names.map((n) => `{${n}}`).join(' | '))}, "UI"`);
        const keys = paramKeys(code, (path) =>
            path.isCallExpression() && path.node.callee.type === 'Identifier' && path.node.callee.name === 't'
                ? (path.node.arguments[2] as t.ObjectExpression)
                : null,
        );
        expect(keys).toEqual(unique(c.names));
    });
});
