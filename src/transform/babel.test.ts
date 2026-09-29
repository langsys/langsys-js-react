/**
 * The placeholder transform's output (spec VAR-6), on source as an app writes it.
 */
import { transformSync } from '@babel/core';
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
