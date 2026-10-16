import { Fragment, createElement as el, lazy, Suspense, createContext, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPortal } from 'react-dom';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { hasRuntimeValues, toBlockNodes, withNodeParams } from './block-nodes.js';
import { DontTranslate } from './components/DontTranslate.js';

describe('toBlockNodes', () => {
    it('maps host elements, attributes, strings and numbers; fragments and arrays flatten', () => {
        const r = toBlockNodes([
            el('p', { className: 'lead', title: 'Intro', onClick: () => {} }, 'Hello ', el('strong', null, 'world'), '!'),
            el(Fragment, null, 'Only ', 3, ' left'),
            null,
            false,
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.nodes).toEqual([
            {
                tag: 'p',
                attrs: { class: 'lead', title: 'Intro' },
                children: [{ text: 'Hello ' }, { tag: 'strong', children: [{ text: 'world' }] }, { text: '!' }],
            },
            { text: 'Only ' },
            { text: '3' },
            { text: ' left' },
        ]);
    });

    it('a fragment inside any list React renders, a Set too, flattens', () => {
        const r = toBlockNodes(['Hello ', el('b', null, 'world'), new Set([el(Fragment, { key: 'f' }, el('i', null, 'x'))])] as never);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.nodes).toEqual([{ text: 'Hello ' }, { tag: 'b', children: [{ text: 'world' }] }, { tag: 'i', children: [{ text: 'x' }] }]);
    });

    it('numbers elements in document order through fragments and arrays', () => {
        const onClick = () => {};
        const link = el('a', { href: '/x', onClick }, 'Go');
        const r = toBlockNodes([el(Fragment, null, 'Intro ', el('em', null, 'now')), el('p', null, [null, 'Then ', link])]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // nodes: [text 'Intro ', em, p[text 'Then ', a]] — the fragment and array are gone.
        expect(r.nodes.map((n) => ('tag' in n ? n.tag : 'text' in n ? n.text : ''))).toEqual(['Intro ', 'em', 'p']);
        expect(r.elements.map((e) => e.type)).toEqual(['em', 'p', 'a']);
        // Children.toArray re-keys elements; type, props, handlers and ref carry through unchanged.
        expect(r.elements[2].type).toBe(link.type);
        expect(r.elements[2].props).toBe(link.props);
        expect((r.elements[2].props as { onClick: unknown }).onClick).toBe(onClick);
    });

    it('a portal is kept for rendering and excluded from the nodes', () => {
        const target = { nodeType: 1 } as unknown as Element;
        const portal = createPortal(el('div', null, 'Dialog'), target);
        const r = toBlockNodes(el('p', null, 'Body ', portal));
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.nodes).toEqual([{ tag: 'p', children: [{ text: 'Body ' }] }]);
        expect(r.portals).toEqual([portal]);
    });

    it.each([
        ['a function component', el(function Name() { return el('b', null, 'Ada'); })],
        ['a context provider', el(createContext('x').Provider, { value: 'y' }, 'Hi')],
        ['lazy', el(lazy(async () => ({ default: () => null })))],
        ['Suspense', el(Suspense, null, 'Hi')],
        ['dangerouslySetInnerHTML', el('div', { dangerouslySetInnerHTML: { __html: '<b>x</b>' } })],
    ])('%s makes the tree unmappable, with a reason', (_name, child) => {
        const r = toBlockNodes(el('p', null, 'Hello ', child));
        expect(r.ok).toBe(false);
    });
});

describe('<DontTranslate> in a unit', () => {
    it('maps to the host element it renders, so the unit stays a tree', () => {
        const r = toBlockNodes(['Signed in as ', el(DontTranslate, { tag: 'kbd', className: 'id' }, 'a@b.c'), ' today']);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.nodes).toEqual([
            { text: 'Signed in as ' },
            { tag: 'kbd', attrs: { translate: 'no', 'data-ls-dont-translate': '', class: 'id' }, children: [{ text: 'a@b.c' }] },
            { text: ' today' },
        ]);
        expect(r.elements.map((e) => e.type)).toEqual(['kbd']);
    });

    // React hands a fragment's children to its parent: its text is part of the run around it.
    it('a fragment is read as part of the run around it', () => {
        expect(hasRuntimeValues(['Hi ', el(Fragment, null, 'Ana'), ' today'])).toBe(true);
        expect(hasRuntimeValues([el('p', null, 'Hi ', el(Fragment, null, el(Fragment, null, 'Ana')))], true)).toBe(true);
        expect(hasRuntimeValues(['Hi ', el(Fragment, null, el('b', null, 'Ana'))])).toBe(false);
    });

    // A value alone in its element cannot be told from literal text, whatever its type; the build
    // transform's marker holds its value so, and is never read as split.
    it('a value alone in its element, as a marker holds one, is not a split value', () => {
        expect(hasRuntimeValues(['Seats left: ', el('span', { 'data-ls-param': 'n' }, 3), ' today'])).toBe(false);
        expect(hasRuntimeValues([el('p', null, 'Total ', el('span', { translate: 'yes' }, el('span', { 'data-ls-param': 'n' }, 4)), ' items')])).toBe(false);
    });

    it('a value split inside it is a runtime value, as inside any host element', () => {
        expect(hasRuntimeValues(['Hi ', el(DontTranslate, null, 'Mr ', 'Ana')])).toBe(true);
        expect(hasRuntimeValues(['Hi ', el(DontTranslate, null, 'Kangen')])).toBe(false);
    });

    it('in a phrase, a subtree that is not translated is not read; a value elsewhere still is', () => {
        const excluded = [
            el(DontTranslate, null, 'Mr ', 'Ana'),
            el('span', { translate: 'no' }, 'Mr ', 'Ana'),
            el('span', { translate: 'NO' }, 'Mr ', 'Ana'),
            el('span', { 'data-notrans': true }, 'Mr ', 'Ana'),
            el('span', { 'data-notrans': 'yes' }, el('b', null, 'Mr ', 'Ana')),
        ];
        for (const child of excluded) {
            expect(hasRuntimeValues(['Hi ', child], true)).toBe(false);
            expect(hasRuntimeValues(['Hi ', child])).toBe(true);
        }
        // Not an opt-out, as the core reads it: the value counts in a phrase too.
        const optedBackIn: Array<Record<string, string>> = [{ 'data-notrans': 'false' }, { 'data-notrans': ' 0 ' }, { translate: 'yes' }];
        for (const attrs of optedBackIn) {
            expect(hasRuntimeValues(['Hi ', el('span', attrs, 'Mr ', 'Ana')], true)).toBe(true);
        }
        expect(hasRuntimeValues(['Hi ', 'Ana', el(DontTranslate, null, 'Kangen')], true)).toBe(true);
    });

    it('in a phrase, code and notation the core shows as written are not read either', () => {
        for (const tag of ['math', 'script', 'style', 'template', 'noscript']) {
            expect(hasRuntimeValues(['Total ', el(tag, null, 'n = ', 3)], true)).toBe(false);
            expect(hasRuntimeValues(['Total ', el(tag, null, 'n = ', 3)])).toBe(true);
        }
    });
});

describe('a param React renders as nodes', () => {
    const html = (node: ReactNode) => renderToStaticMarkup(el('div', null, node));

    it('is put back where its placeholder stands, at any depth, and leaves the params', () => {
        const icon = el('svg', { role: 'img' });
        const { children, params } = withNodeParams(['Click %icon% to ', el('b', null, 'go %icon%')], { icon, n: 3 });
        expect(params).toEqual({ n: 3 });
        expect(html(children)).toBe('<div>Click <svg role="img"></svg> to <b>go <svg role="img"></svg></b></div>');
    });

    it('null and undefined, which React renders as nothing, fill their placeholder with nothing; a boolean stays a boolean', () => {
        const out = withNodeParams('Hi %a%%b%%c%%d%!', { a: null, b: undefined, c: false, d: true, n: 0 });
        expect(out.children).toBe('Hi %a%%b%%c%%d%!');
        expect(out.params).toEqual({ a: '', b: '', c: false, d: true, n: 0 });
    });

    it('a list that is not an array (a Set, a generator) is put back in its place too, as React renders it', () => {
        function* tags() {
            yield el('b', { key: 'x' }, 'x');
            yield el('b', { key: 'y' }, 'y');
        }
        for (const list of [new Set([el('b', { key: 'x' }, 'x'), el('b', { key: 'y' }, 'y')]), tags()]) {
            const out = withNodeParams(el('p', null, 'Tags: %tags%'), { tags: list });
            expect(html(out.children)).toBe('<div><p>Tags: <b>x</b><b>y</b></p></div>');
            expect(out.params).toEqual({});
        }
    });

    it('a date from another realm is a date, and a param', () => {
        const due = runInNewContext('new Date(0)') as Date;
        expect(withNodeParams('Due %due%', { due }).params).toEqual({ due });
    });

    // The peer range includes React 18, which has no `use`. A named import of it fails to link when
    // Node loads the ESM build against React 18's CommonJS module, before any code runs; a promise or
    // a context, which React 18 does not render either, stays a node for React.
    it('loads and maps params under a React with no use', async () => {
        const source = readFileSync(new URL('./block-nodes.ts', import.meta.url), 'utf8');
        expect(source).not.toMatch(/import\s*\{[^}]*\buse\b[^}]*\}\s*from\s*'react'/);
        vi.resetModules();
        vi.doMock('react', async () => {
            const actual = await vi.importActual<typeof import('react')>('react');
            return { ...actual, use: undefined, default: { ...actual, use: undefined } };
        });
        try {
            const fresh = await import('./block-nodes.js');
            const pending = Promise.resolve('Ana');
            const out = fresh.withNodeParams('Hello %name%', { name: pending, n: 3 });
            expect(out.params).toEqual({ n: 3 });
        } finally {
            vi.doUnmock('react');
            vi.resetModules();
        }
    });

    // A value an attribute's placeholder can't hold as text (one React renders as nodes: a list, an
    // object) is put back where the placeholder stands, the whole prop, and React writes it as it
    // writes any attribute value. Every other value fills the placeholder as it fills one in the text.
    it('a prop that is exactly one placeholder takes a value React renders as nodes', () => {
        const node = el('p', null, el('img', { alt: '%who%', title: 'By %who%' }), el('abbr', { title: '{tags}' }, 'x'));
        const nodes = withNodeParams(node, { who: ['Ana', 'Bo'], tags: { toString: () => 'red' } });
        expect(html(nodes.children)).toBe('<div><p><img alt="Ana,Bo" title="By %who%"/><abbr title="red">x</abbr></p></div>');
        expect(nodes.params).toEqual({ who: 'Ana,Bo' });
        // Nothing, a boolean, a number or a date fills it as text, as a placeholder the developer wrote is filled.
        const text = withNodeParams(node, { who: undefined, tags: false, icon: el('i') });
        expect(text.children).toBe(node);
        expect(text.params).toEqual({ who: '', tags: false });
    });

    // An attribute's text is a string: a node value there fills its placeholder as JavaScript writes
    // the value into a string, the param the core fills the attribute with.
    it("a node value in an attribute's text fills it as JavaScript writes it into a string", () => {
        const tags = ['ana', 'bo'];
        const out = withNodeParams(el('p', null, el('img', { alt: '%tags%', title: 'Pic %tags%' }), el('b', null, '%tags%')), { tags });
        expect(html(out.children)).toBe('<div><p><img alt="ana,bo" title="Pic %tags%"/><b>anabo</b></p></div>');
        expect(out.params).toEqual({ tags: 'ana,bo' });
        expect(withNodeParams(el('b', null, '%tags%'), { tags }).params).toEqual({});
        expect(withNodeParams(el('img', { title: 'Pic %s{tags}' }), { tags }).params).toEqual({ tags: 'ana,bo' });
    });

    // The core reads `%name%` left to right: `%a%b%b%` is `%a%`, `b`, `%b%`, whichever names are nodes.
    it('finds a placeholder where the core reads one, after the placeholders before it', () => {
        const out = withNodeParams('%a%b%b% and %s{b}', { a: 'A', b: el('i') });
        expect(html(out.children)).toBe('<div>%a%b<i></i> and %s<i></i></div>');
    });

    // The SDK's params take no bigint; React renders one as its digits.
    it('a bigint is passed as its digits', () => {
        expect(withNodeParams('%n%', { n: BigInt('12345678901234567890') }).params).toEqual({ n: '12345678901234567890' });
    });

    // A placeholder the transform writes in the stored form, `{name}`, where `%name%` would be misread.
    it('is put back at a placeholder in the stored form too', () => {
        const out = withNodeParams('Press %s{icon} or %icon%', { icon: el('i') });
        expect(html(out.children)).toBe('<div>Press %s<i></i> or <i></i></div>');
        expect(out.params).toEqual({});
    });

    it('any param name, whatever characters it holds', () => {
        const out = withNodeParams('x %a(b% y', { 'a(b': el('i') });
        expect(html(out.children)).toBe('<div>x <i></i> y</div>');
    });

    it('an array of elements too; text params, an unused node param and children without one are left as they are', () => {
        const items = [el('li', { key: 'a' }, 'a'), el('li', { key: 'b' }, 'b')];
        const due = new Date(0);
        const out = withNodeParams(el('ul', null, '%items%'), { items, due, name: 'Ana' });
        expect(html(out.children)).toBe('<div><ul><li>a</li><li>b</li></ul></div>');
        expect(out.params).toEqual({ due, name: 'Ana' });
        expect(withNodeParams('Hi %x%', { x: el('i') }).params).toEqual({});
        const plain = ['Hi ', el('b', null, 'there')];
        expect(withNodeParams(plain, { n: 1 }).children).toBe(plain);
    });
});
