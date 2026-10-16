// @vitest-environment jsdom
/**
 * `<Translate>` and `<Phrase>` rendered through the core's tree path (`renderBlock`).
 *
 * - A translation that reorders a phrase's inline markup moves the original React elements with
 *   it: each link keeps its own handler, on the client and through a server render and
 *   hydration with no mismatch.
 * - A block that holds a component cannot be rendered without a DOM (SRV-1's sanctioned exception):
 *   on a server it is served as its source with its explicit id, and the core notices it once.
 */
import { Suspense, act, createContext, createElement as el, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DontTranslate, LangsysApp, Phrase, Translate, createLocaleStore } from './index.js';
import { renderInRequestScope } from './server.js';
import { catalog } from './test-helpers/ssr-scope.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ES = catalog({
    UI: { 'Read {m0o}terms{m0c} and {m1o}privacy{m1c}': 'Lee la {m1o}privacidad{m1c} y los {m0o}términos{m0c}' },
});

function Consent({ onTerms, onPrivacy }: { onTerms: () => void; onPrivacy: () => void }) {
    return el(
        Phrase,
        { category: 'UI' },
        'Read ',
        el('a', { href: '/terms', onClick: onTerms }, 'terms'),
        ' and ',
        el('a', { href: '/privacy', onClick: onPrivacy }, 'privacy'),
    );
}

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('<Phrase> reordered by its translation', () => {
    it('each link moves with its handler', async () => {
        LangsysApp.seedCatalog(ES, 'es-es');
        const onTerms = vi.fn();
        const onPrivacy = vi.fn();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () => root.render(el(Consent, { onTerms, onPrivacy })));

        expect(host.textContent).toBe('Lee la privacidad y los términos');
        const [first, second] = host.querySelectorAll('a');
        expect(first.getAttribute('href')).toBe('/privacy');
        first.click();
        expect(onPrivacy).toHaveBeenCalledTimes(1);
        expect(onTerms).not.toHaveBeenCalled();
        second.click();
        expect(onTerms).toHaveBeenCalledTimes(1);
        await act(async () => root.unmount());
    });

    it('a server render in a scope hydrates with no mismatch, handlers attached', async () => {
        const onTerms = vi.fn();
        const onPrivacy = vi.fn();
        const tree = el(Consent, { onTerms, onPrivacy });
        const { result: html, seed, close } = await renderInRequestScope({ locale: 'es-es', catalog: ES }, () =>
            renderToString(tree),
        );
        await close();
        expect(html).toContain('privacidad');

        LangsysApp.seedCatalog(seed.catalog, seed.locale, seed);
        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        const recoverable: unknown[] = [];
        let root!: ReturnType<typeof hydrateRoot>;
        await act(async () => {
            root = hydrateRoot(container, tree, { onRecoverableError: (e) => recoverable.push(e) });
        });
        expect(recoverable).toEqual([]);
        container.querySelector('a')!.click();
        expect(onPrivacy).toHaveBeenCalledTimes(1);
        await act(async () => root.unmount());
    });
});

describe('the seed a scope hands the client (SRV-4)', () => {
    it('carries each block it served, under the id stamped in the HTML', async () => {
        const IT = catalog({ UI: { 'Hello world': 'Ciao mondo' } });
        const { result: html, seed, close } = await renderInRequestScope({ locale: 'it', catalog: IT }, () =>
            renderToString(el(Translate, { category: 'UI' }, el('p', null, 'Hello world'), el('p', null, 'Second line'))),
        );
        await close();
        const id = /data-ls-contentblock="([^"]+)"/.exec(html)?.[1];
        expect(id).toBeTruthy();
        expect(seed.blocks[id!]).toMatchObject({ customId: id, category: 'UI', shape: 'block' });
    });
});

describe('<DontTranslate> inside a unit', () => {
    it('stays on the tree path: a server render translates the phrase around it and shows it as written', async () => {
        const SIGNED = catalog({ UI: { 'Signed in as {m0o}{m0c} today': 'Conectado como {m0o}{m0c} hoy' } });
        const tree = el(Phrase, { category: 'UI' }, 'Signed in as ', el(DontTranslate, null, 'ana@example.com'), ' today');
        const { result: html, close } = await renderInRequestScope({ locale: 'es-es', catalog: SIGNED }, () => renderToString(tree));
        await close();
        expect(html).toContain('Conectado como <span translate="no" data-ls-dont-translate="">ana@example.com</span> hoy');
    });
});

describe('a param that is an element, in a phrase its translation reorders', () => {
    it('moves with its own key, beside the phrase\'s other elements', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        const tree = el(
            Phrase,
            { category: 'REORDER', params: { x: el('i', { id: 'i' }, 'it') } as never },
            'Read ',
            el('b', { id: 'b' }, 'terms'),
            ' and %x% now',
        );
        await act(async () => root.render(tree));
        expect(host.firstElementChild!.innerHTML).toBe('Read <b id="b">terms</b> and <i id="i">it</i> now');
        await act(async () =>
            LangsysApp.seedCatalog(
                catalog({ REORDER: { 'Read {m0o}terms{m0c} and {m1o}it{m1c} now': '{m1o}ELLO{m1c} y {m0o}TERMINOS{m0c} leer' } }),
                'es-es',
            ),
        );
        expect(host.firstElementChild!.innerHTML).toBe('<i id="i">ELLO</i> y <b id="b">TERMINOS</b> leer');
        expect(errors.mock.calls.flat().map(String).join(' ')).not.toMatch(/same key/);
        await act(async () => root.unmount());
    });
});

describe('a param that is an element, in a unit that falls back to the DOM class', () => {
    const Link = ({ children }: { children?: ReactNode }) => el('a', { href: '/settings' }, children);

    it('renders in its place with no key warning, at the top of the unit or inside an element', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const icon = el('svg', { role: 'img' });
        for (const unit of [Translate, Phrase]) {
            for (const children of [
                ['Click %icon% to open ', el(Link, null, 'settings')],
                [el('b', null, 'Click %icon%'), ' to open ', el(Link, null, 'settings')],
            ]) {
                const host = document.createElement('div');
                document.body.appendChild(host);
                const root = createRoot(host);
                await act(async () => root.render(el(unit, { category: 'K', params: { icon } as never }, ...children)));
                expect(host.innerHTML).toMatch(/Click (<\/?b>)?<svg role="img"><\/svg>(<\/b>)? to open <a href="\/settings">settings<\/a>/);
                await act(async () => root.unmount());
            }
        }
        expect(errors.mock.calls.flat().map(String).join(' ')).not.toMatch(/"key" prop/);
    });
});

describe('an element\'s camelCase props', () => {
    it('come back as the props they are, with no attribute React does not know', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        const tree = el(
            Translate,
            { category: 'PROPS' },
            el('p', null, 'Go ', el('a', { href: '/x', tabIndex: 0, className: 'go' }, 'there')),
            el('select', { defaultValue: 'b', 'aria-label': 'Pick' }, el('option', { value: 'a' }, 'A'), el('option', { value: 'b' }, 'B')),
        );
        await act(async () => root.render(tree));
        expect(host.querySelector('a')!.outerHTML).toBe('<a href="/x" tabindex="0" class="go">there</a>');
        expect(host.querySelector('select')!.getAttributeNames().sort()).toEqual(['aria-label']);
        expect(host.querySelector('select')!.value).toBe('b');
        expect(errors.mock.calls.flat().map(String).join(' ')).not.toMatch(/Invalid DOM property|React does not recognize/);
        await act(async () => root.unmount());
    });
});

describe('an element\'s boolean props', () => {
    const form = () =>
        el(
            Translate,
            { category: 'BOOL' },
            el('p', null, 'Name ', el('input', { type: 'checkbox', readOnly: true, required: true, disabled: true, defaultChecked: true })),
            el('button', { disabled: true }, 'Send'),
            el('span', { hidden: true }, 'h'),
            el('details', { open: true }, 'o'),
            el('span', { 'aria-hidden': true }, '*'),
        );
    const check = (root: ParentNode) => {
        const input = root.querySelector('input')!;
        expect([input.readOnly, input.required, input.disabled, input.defaultChecked]).toEqual([true, true, true, true]);
        expect(root.querySelector('button')!.disabled).toBe(true);
        expect((root.querySelectorAll('span')[0] as HTMLElement).hidden).toBe(true);
        expect(root.querySelector('details')!.open).toBe(true);
        expect(root.querySelectorAll('span')[1].getAttribute('aria-hidden')).toBe('true');
    };

    it('stay set, in the browser and on a server', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () => root.render(form()));
        check(host);
        await act(async () => root.unmount());

        const { result: html, close } = await renderInRequestScope({ locale: 'es-es', catalog: ES }, () => renderToString(form()));
        await close();
        const parsed = document.createElement('div');
        parsed.innerHTML = html;
        check(parsed);
    });
});

describe('a param element beside the unit\'s own first element', () => {
    it('never shares its key, in both components', async () => {
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const icon = el('svg', { role: 'img' });
        for (const unit of [Translate, Phrase]) {
            const host = document.createElement('div');
            document.body.appendChild(host);
            const root = createRoot(host);
            await act(async () => root.render(el(unit, { category: 'TIP', params: { icon } as never }, el('b', null, 'Tip:'), ' click %icon% to go')));
            expect(host.firstElementChild!.innerHTML).toBe('<b>Tip:</b> click <svg role="img"></svg> to go');
            await act(async () => root.unmount());
        }
        expect(errors.mock.calls.flat().map(String).join(' ')).not.toMatch(/same key/);
    });
});

describe('a param React renders as nodes, once or later', () => {
    const Widget = () => el('i', null, 'w');

    it('a generator renders its items, and a fulfilled promise its value, in both components', async () => {
        for (const unit of [Translate, Phrase]) {
            function* tags() {
                yield el('b', { key: 'x' }, 'x');
                yield el('b', { key: 'y' }, 'y');
            }
            const name = Object.assign(Promise.resolve('Ana'), { status: 'fulfilled', value: 'Ana' });
            const shown: string[] = [];
            for (const tree of [
                el(unit, { category: 'G', params: { tags: tags() } as never }, 'Tags: %tags% here ', el(Widget)),
                el(Suspense, { fallback: 'loading' }, el(unit, { category: 'G', params: { name } as never }, 'Hello %name% today')),
            ]) {
                const host = document.createElement('div');
                document.body.appendChild(host);
                const root = createRoot(host);
                await act(async () => root.render(tree));
                shown.push(host.textContent ?? '');
                await act(async () => root.unmount());
            }
            expect(shown).toEqual(['Tags: xy here w', 'Hello Ana today']);
        }
    });

    it('a promise param is read, so its value is the param a translation fills', async () => {
        const HOLA = catalog({ C: { 'Hello {name} today': 'Hola {name} hoy' } });
        const name = Object.assign(Promise.resolve('Ana'), { status: 'fulfilled', value: 'Ana' });
        const tree = el(
            'div',
            null,
            el(Translate, { category: 'C', params: { name } as never }, 'Hello %name% today'),
            el(Phrase, { category: 'C', params: { name } as never }, 'Hello %name% today'),
        );
        const { result: html, close } = await renderInRequestScope({ locale: 'es-es', catalog: HOLA }, () => renderToString(tree));
        await close();
        expect(html.match(/Hola Ana hoy/g)).toHaveLength(2);
    });

    // A context left in a unit's content, as the transform leaves one inside a part that is not
    // translated, is read as React reads a context child.
    it('a context in the content renders its value, on a server and in the browser', async () => {
        const Theme = createContext('dark');
        const tree = el(
            'div',
            null,
            el(Translate, { category: 'R' }, 'Signed in as ', el(DontTranslate, null, Theme as never), ' now'),
            el(Phrase, { category: 'R' }, 'Signed in as ', el('span', { translate: 'no' }, Theme as never), ' now'),
        );
        expect(renderToString(tree).replace(/<[^>]+>/g, '')).toBe('Signed in as dark nowSigned in as dark now');
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () => root.render(tree));
        expect(host.textContent).toBe('Signed in as dark nowSigned in as dark now');
        await act(async () => root.unmount());
    });

    // A Set or a Map is read again on every render, as React reads one; only a one-shot list is kept.
    it('a Set renders what it holds at each render', () => {
        const recent = new Set([el('b', { key: 'a' }, 'a')]);
        const tree = () => el(Translate, { category: 'R', params: { recent } as never }, 'Recent: %recent% now');
        expect(renderToString(tree())).toContain('Recent: <b>a</b> now');
        recent.add(el('b', { key: 'b' }, 'b'));
        expect(renderToString(tree())).toContain('Recent: <b>a</b><b>b</b> now');
    });

    it('a <Phrase> given null params renders', () => {
        expect(renderToString(el(Phrase, { category: 'N', params: null as never }, 'Hello there'))).toContain('Hello there');
    });

    // React reads a context child, renders nothing for a function or a symbol, and a list the unit
    // read once stays read when it renders again.
    it('a context renders its value, a function or a symbol nothing, and a one-shot list survives a render again', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const Theme = createContext('dark');
        for (const unit of [Translate, Phrase]) {
            function* tags() {
                yield el('b', { key: 'x' }, 'x');
                yield el('b', { key: 'y' }, 'y');
            }
            const list = tags();
            const shown: string[] = [];
            const host = document.createElement('div');
            document.body.appendChild(host);
            const root = createRoot(host);
            for (const tree of [
                el(unit, { category: 'R', params: { theme: Theme } as never }, 'Theme: %theme% now'),
                el(unit, { category: 'R', params: { fn: () => 'secret' } as never }, 'Click %fn% here'),
                el(unit, { category: 'R', params: { tag: Symbol('tag') } as never }, 'Tag %tag% here'),
                el(unit, { category: 'R', params: { list } as never }, 'Tags: %list% now'),
                el(unit, { category: 'R', params: { list }, className: 'again' } as never, 'Tags: %list% now'),
            ]) {
                await act(async () => root.render(tree));
                shown.push((host.textContent ?? '').replace(/\s+/g, ' '));
            }
            await act(async () => root.unmount());
            expect(shown).toEqual(['Theme: dark now', 'Click here', 'Tag here', 'Tags: xy now', 'Tags: xy now']);
        }
    });
});

describe('a boolean param', () => {
    it('reaches the core as a boolean, so a select branches on it, as in t()', async () => {
        const OWN = catalog({ OWN: { 'It is {owner}': '{owner, select, true {Es tuyo} other {Es de otro}}' } });
        const tree = el(
            'div',
            null,
            el(Translate, { category: 'OWN', params: { owner: true } }, 'It is %owner%'),
            el(Phrase, { category: 'OWN', params: { owner: true } }, 'It is %owner%'),
        );
        const { result: html, close } = await renderInRequestScope({ locale: 'es-es', catalog: OWN }, () => renderToString(tree));
        await close();
        expect(html.match(/Es tuyo/g)).toHaveLength(2);
        expect(html).not.toContain('Es de otro');
    });
});

describe('<DontTranslate> at the edge of a paragraph', () => {
    const EDGE = catalog({ EDGE: { 'Built with': 'Hecho con', 'is ours': 'es nuestro' } });
    const last = (category: string) =>
        el(Translate, { category }, el('p', null, 'Built with ', el(DontTranslate, null, 'Kangen')));
    const first = (category: string) =>
        el(Translate, { category }, el('p', null, el(DontTranslate, null, 'Kangen'), ' is ours'));

    it('keeps the space beside it, as source and translated, in the browser and on a server', async () => {
        LangsysApp.seedCatalog(EDGE, 'es-es');
        const shown: string[] = [];
        for (const tree of [last('SOURCE'), first('SOURCE'), last('EDGE'), first('EDGE')]) {
            const host = document.createElement('div');
            document.body.appendChild(host);
            const root = createRoot(host);
            await act(async () => root.render(tree));
            shown.push(host.querySelector('p')!.innerHTML);
            await act(async () => root.unmount());
        }
        const kangen = '<span translate="no" data-ls-dont-translate="">Kangen</span>';
        expect(shown).toEqual([`Built with ${kangen}`, `${kangen} is ours`, `Hecho con ${kangen}`, `${kangen} es nuestro`]);

        const { result: html, close } = await renderInRequestScope({ locale: 'es-es', catalog: EDGE }, () =>
            renderToString(el('div', null, last('EDGE'), first('EDGE'))),
        );
        await close();
        expect(html).toContain(`<p>Hecho con ${kangen}</p>`);
        expect(html).toContain(`<p>${kangen} es nuestro</p>`);
    });
});

describe('a block the tree path cannot render', () => {
    function Badge() {
        return el('b', null, 'New');
    }

    it('on a server: source served, explicit id stamped, no resolved marker, and the core notices it once', async () => {
        const notice = vi.spyOn(console, 'log').mockImplementation(() => {});
        const tree = el(Translate, { category: 'UI', custom_id: 'promo' }, el('p', null, 'Hello world'), el(Badge));
        const { result: html, close } = await renderInRequestScope({ locale: 'es-es', catalog: ES }, async () => {
            // A block the binding declines to capture takes SRV-1's fallback and throws nothing (SRV-5).
            expect(() => renderToString(tree)).not.toThrow();
            return renderToString(tree);
        });
        await close();
        expect(html).toBe('<translate data-ls-contentblock="promo"><p>Hello world</p><b>New</b></translate>');
        expect(html).not.toContain('data-ls-resolved');

        // The core holds a notice raised before init() until debug is known; init settles it
        // synchronously, before any network call (which may fail: the core never throws on it).
        void LangsysApp.init({
            projectid: 'p',
            key: 'k',
            UserLocaleStore: createLocaleStore('es-es'),
            debug: true,
            apiUrl: 'http://127.0.0.1:9',
        } as never).catch(() => {});
        const messages = notice.mock.calls.map((c) => c.join(' ')).filter((m) => m.includes('was served as source'));
        expect(messages).toHaveLength(1);
    });
});
