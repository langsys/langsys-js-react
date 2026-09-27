import { Fragment, createElement as el, lazy, Suspense, createContext } from 'react';
import { createPortal } from 'react-dom';
import { describe, expect, it } from 'vitest';
import { toBlockNodes } from './block-nodes.js';

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
