/**
 * The placeholder transform's output (spec VAR-6), on source as an app writes it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSync, transformSync, traverse, types as T, type NodePath, type types as t } from '@babel/core';
import { transformWithEsbuild } from 'vite';
import { describe, expect, it } from 'vitest';
import langsysPlaceholders, { type LangsysTransformMetadata } from './babel.js';
import { transformSource } from './run.js';

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

describe('fragments', () => {
    // React passes a fragment's children on to its parent's: unwrapped, its text joins the run around it.
    it('a fragment is unwrapped, so its text and values join the run around it', async () => {
        const source =
            "import React, { Fragment } from 'react';\nimport * as R from 'react';\n" +
            IMPORT +
            'const A = ({ name }) => <Translate>Hi <Fragment>{name}</Fragment> today</Translate>;\n' +
            'const B = ({ name }) => <Phrase>Hi <React.Fragment>{name}</React.Fragment> today</Phrase>;\n' +
            'const C = ({ name }) => <Translate>Hi <>{name}, <b>you</b></></Translate>;\n' +
            'const D = ({ name }) => <Translate>Hi <R.Fragment key="k">{name}</R.Fragment> today</Translate>;';
        const { code } = run(source);
        expect(code).toContain('<Translate params={{ name: name }}>Hi %name% today</Translate>');
        expect(code).toContain('<Phrase params={{ name: name }}>Hi %name% today</Phrase>');
        expect(code).toContain('<Translate params={{ name: name }}>Hi %name%, <b>you</b></Translate>');
        const { inPass, esbuild } = await reachesReact(source);
        const expected = [['Hi %name% today'], ['Hi %name% today'], ['Hi %name%, ', 'JSXElement'], ['Hi %name% today']];
        expect(inPass).toEqual(expected);
        expect(esbuild).toEqual(expected);
    });

    it('a component named Fragment from elsewhere is not unwrapped', () => {
        const { code } = run("import { Fragment } from './ui';\n" + IMPORT + 'const A = ({ name }) => <Translate>Hi <Fragment>{name}</Fragment></Translate>;');
        expect(code).toContain('<Translate>Hi <Fragment>{name}</Fragment></Translate>');
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

    it('an attribute that does not opt out leaves the value a param', () => {
        const { code } = run(
            DNT +
                'const A = ({ a, b, c }) => <Translate><span data-notrans="false">{a}</span>' +
                '<span data-notrans=" 0 ">{b}</span><span translate="yes">{c}</span></Translate>;',
        );
        expect(code).toContain('params={{ a: a, b: b, c: c }}');
        expect(code).not.toContain('data-ls-param');
    });

    // A marked value reads as its placeholder in translated text too, so marking is right whichever
    // way the attribute turns out.
    // Excluded, the marker shows the value as written; translated, the core reads the marker as its
    // placeholder and the param, which wins over the marked text, fills it formatted.
    it('an opt-out the build cannot read marks the value and passes it as a param too', () => {
        const { code } = run(
            DNT +
                'const A = ({ a, b, c, x, flag }) => <Translate><span translate={x}>{a}</span>' +
                '<span data-notrans={true}>{b}</span><span data-notrans={flag}>{c}</span></Translate>;',
        );
        for (const n of ['a', 'b', 'c']) expect(code).toContain(`<span data-ls-param="${n}">{${n}}</span>`);
        expect(code).toContain('params={{ a: a, b: b, c: c }}');
    });

    it('inside code and notation the core shows as written: marked, except in raw-text script and style', () => {
        const { code } = run(
            DNT +
                'const A = ({ t, n, css, js }) => <Translate>' +
                '<template><b>{t}</b></template><noscript>{n}</noscript><style>{css}</style><script>{js}</script></Translate>;',
        );
        for (const n of ['t', 'n']) expect(code).toContain(`<span data-ls-param="${n}">{${n}}</span>`);
        expect(code).toContain('<style>{css}</style><script>{js}</script>');
        expect(code).not.toContain('params');
    });

    // An HTML <span> inside MathML or SVG is created in that namespace and draws nothing, so a value
    // there is left as written; a <Translate> would store it in its content, so it registers
    // nothing (VAR-7). A <Phrase> keys code and notation as one empty pair and stores no content.
    it('inside MathML and SVG a value is left as written, and a <Translate> holding one registers nothing', () => {
        const { code } = run(
            DNT +
                'const A = ({ v, s, f }) => <Translate><p>Area <math><mi>{v}</mi></math></p>' +
                '<DontTranslate><svg><text>{s}</text><foreignObject><p>{f}</p></foreignObject></svg></DontTranslate></Translate>;\n' +
                'const B = ({ v }) => <Phrase>Area <math><mi>{v}</mi></math> units</Phrase>;',
        );
        expect(code).toContain('<Translate data-ls-unnamed=""><p>Area <math><mi>{v}</mi></math></p>');
        expect(code).toContain('<text>{s}</text><foreignObject><p><span data-ls-param="f">{f}</span></p></foreignObject>');
        expect(code).toContain('<Phrase>Area <math><mi>{v}</mi></math> units</Phrase>');
        expect(code).not.toContain('params');
    });

    // The core fills a phrase's params into an author's exclusion and keys it as one empty pair, and a
    // translated element takes the placeholder like any text: right whichever way the opt-out turns out.
    it('in a <Phrase>, a value under an opt-out the build cannot read is a placeholder, inside SVG too', () => {
        const { code } = run(
            DNT +
                'const A = ({ m, k }) => <Phrase>Press <kbd translate={m}>{k}</kbd> now</Phrase>;\n' +
                'const B = ({ m, x }) => <Phrase>Total <svg><text translate={m}>{x}</text></svg></Phrase>;',
        );
        expect(code).toContain('<Phrase params={{ k: k }}>Press <kbd translate={m}>%k%</kbd> now</Phrase>');
        expect(code).toContain('<Phrase params={{ x: x }}>Total <svg><text translate={m}>%x%</text></svg></Phrase>');
        expect(code).not.toContain('data-ls-unnamed');
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

    // A phrase holding a marker in its text is served as its source before a translation exists, so
    // its other values are marked too and passed as params; a block, or a marker in an excluded part,
    // changes nothing.
    it('in a <Phrase> holding a marker of its own in its text, every value is marked and passed as a param', () => {
        const { code } = run(
            DNT +
                'const A = ({ user, count }) => <Phrase>Hello {user.name}, you have <span data-ls-param="count">{count}</span> items</Phrase>;\n' +
                'const B = ({ user, count }) => <Translate>Hello {user.name}, you have <span data-ls-param="count">{count}</span> items</Translate>;\n' +
                'const C = ({ user, e }) => <Phrase>Hello {user.name}, <DontTranslate><span data-ls-param="e">{e}</span></DontTranslate></Phrase>;',
        );
        expect(code).toContain(
            '<Phrase params={{ name: user.name }}>Hello <span data-ls-param="name">{user.name}</span>, you have <span data-ls-param="count">{count}</span> items</Phrase>',
        );
        expect(code).toContain('<Translate params={{ name: user.name }}>Hello %name%, you have');
        expect(code).toContain('<Phrase params={{ name: user.name }}>Hello %name%, <DontTranslate>');
    });

    it('a marker of its own inside a conditional counts too; where no marker can stand the value stays and the phrase registers nothing', () => {
        const { code } = run(
            DNT +
                'const A = ({ user, unread }) => <Phrase>Hello {user.name}, you have <b>{unread > 0 && <span data-ls-param="unread">{unread}</span>}</b> new</Phrase>;\n' +
                'const B = ({ n, label }) => <Phrase>Rated <span data-ls-param="n">{n}</span> <svg><title>{label}</title></svg></Phrase>;',
        );
        expect(code).toContain('<Phrase params={{ name: user.name }}>Hello <span data-ls-param="name">{user.name}</span>, you have <b>{unread > 0 &&');
        expect(code).toContain('<Phrase data-ls-unnamed="">Rated <span data-ls-param="n">{n}</span> <svg><title>{label}</title></svg></Phrase>');
    });

    // A name a marker already carries is taken, as an explicit %name% is, so no value is filled with another's.
    it('a name a marker of its own carries is taken', () => {
        const { code } = run(
            DNT +
                'const A = ({ user, file }) => <Translate>{user.name} sent <span data-ls-param="name">{file.name}</span></Translate>;\n' +
                'const B = ({ user, file }) => <Phrase>{user.name} sent <span data-ls-param="name">{file.name}</span></Phrase>;',
        );
        expect(code).toContain('<Translate params={{ user_name: user.name }}>%user_name% sent <span data-ls-param="name">{file.name}</span></Translate>');
        expect(code).toContain('<Phrase params={{ user_name: user.name }}><span data-ls-param="user_name">{user.name}</span> sent');
    });

    // A block stores <script> and <style> in its content as written; a phrase keys them as one empty pair.
    it('inside raw-text script and style a value is left as written, and a <Translate> holding one registers nothing', () => {
        const a = run(DNT + 'const A = ({ json }) => <Translate><p>Hi</p><script type="application/ld+json">{json}</script></Translate>;');
        expect(a.code).toContain('<Translate data-ls-unnamed=""><p>Hi</p><script type="application/ld+json">{json}</script></Translate>');
        const b = run(DNT + 'const B = ({ css }) => <Phrase>Hi <style>{css}</style> there</Phrase>;');
        expect(b.code).toContain('<Phrase>Hi <style>{css}</style> there</Phrase>');
        expect(b.meta.rewritten).toBe(0);
        const c = run(DNT + "const C = () => <Translate><p>Hi</p><style>{'.a{color:red}'}</style></Translate>;");
        expect(c.code).not.toContain('data-ls-unnamed');
    });

    // <textarea>, <title> and <option> hold text only: a marker element there is not drawn, or is not allowed.
    it('inside an element that holds text only, a value under an opt-out is left as written', () => {
        const { code } = run(
            DNT +
                'const A = ({ draft }) => <Translate><p>Notes</p><textarea translate="no">{draft}</textarea></Translate>;\n' +
                'const B = ({ code, x }) => <Phrase>Pick <select><option translate="no">{code}</option><option>{x}</option></select></Phrase>;\n' +
                'const C = ({ m, t }) => <Phrase>Doc <title translate={m}>{t}</title></Phrase>;',
        );
        expect(code).toContain('<Translate data-ls-unnamed=""><p>Notes</p><textarea translate="no">{draft}</textarea></Translate>');
        expect(code).toContain('<Phrase params={{ x: x }}>Pick <select><option translate="no">{code}</option><option>%x%</option></select></Phrase>');
        expect(code).toContain('<Phrase params={{ t: t }}>Doc <title translate={m}>%t%</title></Phrase>');
        expect(code).not.toContain('data-ls-param');
    });

});

/** The children a JSX compiler hands React for each `<Translate>` / `<Phrase>`: text as strings, anything else by node type. */
function compiledChildren(ast: t.Node): unknown[][] {
    const out: unknown[][] = [];
    traverse(ast, {
        JSXElement: {
            exit(p) {
                const n = p.node.openingElement.name;
                if (n.type !== 'JSXIdentifier' || (n.name !== 'Translate' && n.name !== 'Phrase')) return;
                out.push(T.react.buildChildren(p.node).map((c) => (c.type === 'StringLiteral' ? c.value : c.type)));
            },
        },
    });
    return out;
}

/** The children esbuild (Vite's JSX compiler) passes for each `<Translate>` / `<Phrase>`, read from its `h(…)` calls. */
async function esbuildChildren(code: string): Promise<unknown[][]> {
    const out: unknown[][] = [];
    const compiled = await transformWithEsbuild(code, 'App.tsx', { loader: 'tsx', jsx: 'transform', jsxFactory: 'h', jsxFragment: 'F' });
    traverse(parseSync(compiled.code, { babelrc: false, configFile: false })!, {
        CallExpression(p) {
            const [type, , ...children] = p.node.arguments;
            if (p.node.callee.type !== 'Identifier' || p.node.callee.name !== 'h' || type?.type !== 'Identifier') return;
            if (type.name !== 'Translate' && type.name !== 'Phrase') return;
            out.push(children.map((c) => (c.type === 'StringLiteral' ? c.value : c.type === 'CallExpression' ? 'JSXElement' : c.type)));
        },
    });
    return out;
}

/**
 * The same, with the transform in the JSX compiler's own Babel pass (a babel.config.json), and
 * from its generated code compiled again, by Babel and by esbuild (Vite).
 */
async function reachesReact(code: string): Promise<{ inPass: unknown[][]; generated: unknown[][]; esbuild: unknown[][] }> {
    const opts = { filename: 'App.tsx', babelrc: false, configFile: false, parserOpts: { plugins: ['jsx', 'typescript'] as ['jsx', 'typescript'] } };
    let inPass: unknown[][] = [];
    transformSync(code, {
        ...opts,
        plugins: [langsysPlaceholders, () => ({ visitor: { Program: { exit: (p: NodePath) => void (inPass = compiledChildren(p.node)) } } })],
    });
    const output = transformSync(code, { ...opts, plugins: [langsysPlaceholders] })!.code!;
    return { inPass, generated: compiledChildren(parseSync(output, opts)!), esbuild: await esbuildChildren(output) };
}

describe('the text a unit hands React', () => {
    it('is one string per run of text, as React renders the source, in the JSX compiler\'s pass and through generated code', async () => {
        const source =
            IMPORT +
            "const A = ({ name }) => <Translate>Open File {'>'} Save {'{'}as{'}'} {'<'}{name}{'&'}</Translate>;\n" +
            'const B = ({ user }) => (\n    <Phrase>\n        Hello\n        {user.name}\n        today\n    </Phrase>\n);\n' +
            "const C = ({ x }) => <Translate>a{'\\n'}b{'\\t'}{x} <b>{3}</b>{`c`}</Translate>;\n" +
            'const D = () => <Translate>Hello {/* a note */} world</Translate>;\n' +
            "const E = ({ x }) => <Translate>a{'\\u2028'}b{'\\u2029'}c {x}</Translate>;";
        const expected = [
            ['Open File > Save {as} <%name%&'],
            ['Hello%name%today'],
            ['a\nb\t%x% ', 'JSXElement', 'c'],
            ['Hello  world'],
            ['a\u2028b\u2029c %x%'],
        ];
        const { inPass, generated, esbuild } = await reachesReact(source);
        expect(inPass).toEqual(expected);
        expect(generated).toEqual(expected);
        expect(esbuild).toEqual(expected);
    });

    it('a file whose only change is static text is still rewritten by the Vite plugin and the Next loader', async () => {
        const source = IMPORT + "const A = () => <Translate>Open File {'>'} Save</Translate>;";
        const out = await transformSource(source, '/app/Menu.tsx', false);
        expect(out?.code).toContain('<Translate>Open File &#62; Save</Translate>');
    });
});

describe('expressions that render nodes, not text', () => {
    it('children alone in its run of text, and an expression holding JSX, are left where they are', () => {
        const { code } = run(
            IMPORT +
                'const A = ({ children }) => <Translate tag="h1">{children}</Translate>;\n' +
                'const B = (props) => <Phrase><b>Read</b> {props.children}</Phrase>;\n' +
                'const C = ({ items }) => <Translate><ul>{items.map((i) => <li key={i}>{i}</li>)}</ul></Translate>;\n' +
                'const D = ({ items }) => <Translate><p translate="no">{items.map((i) => <b key={i}>{i}</b>)}</p></Translate>;',
        );
        expect(code).toContain('<Translate tag="h1">{children}</Translate>');
        expect(code).toContain('<Phrase><b>Read</b> {props.children}</Phrase>');
        expect(code).toContain('<ul>{items.map(i => <li key={i}>{i}</li>)}</ul>');
        expect(code).toContain('<p translate="no">{items.map(i => <b key={i}>{i}</b>)}</p>');
        expect(code).not.toContain('params');
        expect(code).not.toContain('data-ls-param');
    });

    // Where the core shows content as written, `{children}` is a value like any other: a block would
    // otherwise store whatever its caller passed.
    it('children in a part that is not translated is a value, marked or left as written', () => {
        const { code } = run(
            "import { Translate, DontTranslate } from 'langsys-js-react';\n" +
                'const A = ({ children }) => <Translate>Signed in as <DontTranslate>{children}</DontTranslate> today</Translate>;\n' +
                'const B = ({ children, mode }) => <Translate>Press <kbd translate={mode}>{children}</kbd></Translate>;\n' +
                'const C = ({ children }) => <Translate>Chart <DontTranslate><svg><text>{children}</text></svg></DontTranslate></Translate>;',
        );
        expect(code).toContain('<DontTranslate><span data-ls-param="children">{children}</span></DontTranslate>');
        expect(code).toContain('<Translate params={{ children: children }}>Press <kbd translate={mode}><span data-ls-param="children">{children}</span></kbd>');
        expect(code).toContain('<Translate data-ls-unnamed="">Chart <DontTranslate><svg><text>{children}</text></svg></DontTranslate></Translate>');
    });

    it('children under a TypeScript cast or assertion is still children', () => {
        const { code } = run(
            IMPORT +
                'const A = ({ children }) => <Translate tag="h1">{children as ReactNode}</Translate>;\n' +
                'const B = (props) => <Translate tag="h2">{props.children!}</Translate>;\n' +
                'const C = ({ children }) => <Translate tag="h3">{(children satisfies ReactNode)}</Translate>;',
        );
        expect(code).toContain('<Translate tag="h1">{children as ReactNode}</Translate>');
        expect(code).toContain('<Translate tag="h2">{props.children!}</Translate>');
        expect(code).toContain('<Translate tag="h3">{children satisfies ReactNode}</Translate>');
        expect(code).not.toContain('params');
    });

    // Beside text, children that turn out to be text would split the sentence (VAR-7); as a value,
    // text fills its placeholder and an element renders in its place.
    it('children beside text in its run is a value', () => {
        const { code } = run(
            IMPORT +
                'const A = (props) => <Phrase>Read {props.children}</Phrase>;\n' +
                'const B = ({ children }) => <Translate>Hello {children}!</Translate>;',
        );
        expect(code).toContain('<Phrase params={{ children: props.children }}>Read %children%</Phrase>');
        expect(code).toContain('<Translate params={{ children: children }}>Hello %children%!</Translate>');
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

    // Only the `t` a `useT()` call bound is rewritten, wherever another binding of that name stands.
    it('another function named t in a file that calls useT() is untouched', () => {
        const { code } = run(
            IMPORT +
                'function A({ n }) { const t = useT(); return t(`Hi ${n}`); }\n' +
                "function B({ t, name }) { return t('Hello ' + name); }\n" +
                'function C({ rows }) { return rows.map((t) => t(`row ${t.id}`)); }',
        );
        expect(code).toContain('t("Hi {n}", undefined, { n: n })');
        expect(code).toContain("return t('Hello ' + name);");
        expect(code).toContain('rows.map(t => t(`row ${t.id}`))');
    });

    // Presets in the same Babel pass (preset-env's parameters and destructuring, CRA's production
    // prop-types removal) crawl scopes again, which replaces their binding objects.
    it('still matched in a Babel pass whose other plugins crawl scopes again', () => {
        const crawler = () => ({
            visitor: {
                Program: { enter: (p: NodePath) => p.scope.crawl() },
                Function: (p: NodePath) => p.scope.crawl(),
            },
        });
        const out = transformSync(
            IMPORT +
                'function A({ items }) { const t = useT(); return t(`You have ${items.length} items`); }\n' +
                'function B(props) { return <Translate>Hello {props.user.name}</Translate>; }',
            {
                filename: 'App.tsx',
                babelrc: false,
                configFile: false,
                plugins: [langsysPlaceholders, crawler],
                parserOpts: { plugins: ['jsx', 'typescript'] },
            },
        )!;
        expect(out.code).toContain('t("You have {items_count} items", undefined, {');
        expect(out.code).toContain('Hello %name%');
    });

    // `+` adds left to right: a sum before the first string, or one in parentheses, is one value.
    it('a sum is one value, as JavaScript adds it', () => {
        const { code } = run(
            IMPORT +
                'function A({ page, a, b }) { const t = useT(); return [' +
                "t('Page ' + (page + 1)), t(a + b + ' total'), t('Total: ' + (a + b) + '!'), t(`Sum ` + a + ` and ${b}`)]; }",
        );
        expect(code).toContain('t("Page {value}", undefined, { value: page + 1 })');
        expect(code).toContain('t("{value} total", undefined, { value: a + b })');
        expect(code).toContain('t("Total: {value}!", undefined, { value: a + b })');
        expect(code).toContain('t("Sum {a} and {b}", undefined, { a: a, b: b })');
    });

    // A key built in the call (`errors.${code}`) is a key, not a sentence: legacy-key mode looks it up.
    it('a key built in the call is left as it is', () => {
        const { code, meta } = run(
            IMPORT +
                "function A({ code, field, status, kind }) { const t = useT(); return [t(`errors.${code}`), t('fields.' + field + '.label'), t(`common:${code}`), t(`status_${status}`), t('status_' + status), t(`${kind}Title`)]; }",
        );
        expect(code).toContain('t(`status_${status}`)');
        expect(code).toContain("t('status_' + status)");
        expect(code).toContain('t(`${kind}Title`)');
        expect(code).toContain('t(`errors.${code}`)');
        expect(code).toContain("t('fields.' + field + '.label')");
        expect(code).toContain('t(`common:${code}`)');
        expect(meta.rewritten).toBe(0);
    });

    // A name written in the call's text, or anywhere in a unit, is the developer's: no value takes it.
    it('a name written in a t() text or anywhere in a unit is taken', () => {
        const { code } = run(
            IMPORT +
                'function A({ user, inviter }) { const t = useT(); return t(`{name} invited ${user.name}`, "C", inviter); }\n' +
                'const B = ({ user, params }) => <Translate params={params}><img alt="%name%" /> Bought by {user.name}</Translate>;\n' +
                "const C = ({ user, params }) => <Translate params={params}>{'%name%'} and {user.name}</Translate>;",
        );
        expect(code).toContain('t("{name} invited {user_name}", "C", { ...inviter, user_name: user.name })');
        // With no params to fill it, a `{count}` the text writes is the value's own: an ICU argument on it.
        const icu = run(IMPORT + 'function D({ count }) { const t = useT(); return t(`${count} {count, plural, one {item} other {items}} selected`); }');
        expect(icu.code).toContain('t("{count} {count, plural, one {item} other {items}} selected", undefined, { count: count })');
        expect(code).toContain('<Translate params={{ ...params, user_name: user.name }}><img alt="%name%" /> Bought by %user_name%</Translate>');
        expect(code).toContain('<Translate params={{ ...params, user_name: user.name }}>%name% and %user_name%</Translate>');
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
        // Text around the values, so the call reads as a sentence and not as a key built in the call.
        const { code } = run(IMPORT + `function A(p) { const t = useT(); return t(\`Values: ${c.expressions.map((e) => `\${${e.source}}`).join(' | ')}\`, "UI"); }`);
        expect(code).toContain(`t(${JSON.stringify(`Values: ${c.names.map((n) => `{${n}}`).join(' | ')}`)}, "UI"`);
        const keys = paramKeys(code, (path) =>
            path.isCallExpression() && path.node.callee.type === 'Identifier' && path.node.callee.name === 't'
                ? (path.node.arguments[2] as t.ObjectExpression)
                : null,
        );
        expect(keys).toEqual(unique(c.names));
    });
});
