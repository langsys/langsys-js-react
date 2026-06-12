import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DontTranslate } from './components/DontTranslate.js';
import { Phrase } from './components/Phrase.js';

/**
 * Structural smoke coverage for the two presentational components. The test env
 * is node (no DOM), and static rendering does NOT run effects — so the vanilla
 * `Phrase` handler never mounts here. That's intentional: these assert the
 * server-rendered contract (host element, markers, children passthrough). The
 * live handler behaviour is exercised by the playground in `example/` and the
 * langsys backend testbed.
 */
describe('DontTranslate', () => {
    it('marks its subtree as never-translated', () => {
        const html = renderToStaticMarkup(createElement(DontTranslate, null, 'Kangen®'));
        expect(html).toContain('translate="no"');
        expect(html).toContain('data-ls-dont-translate');
        expect(html).toContain('Kangen®');
    });

    it('honours a custom tag', () => {
        const html = renderToStaticMarkup(createElement(DontTranslate, { tag: 'code' }, 'langsys.dev'));
        expect(html).toMatch(/^<code/);
    });
});

describe('Phrase', () => {
    it('renders a host carrying the phrase marker around its children', () => {
        const html = renderToStaticMarkup(
            createElement(Phrase, { category: 'ProductCard' }, 'Based on {n} reviews'),
        );
        expect(html).toContain('data-ls-phrase');
        expect(html).toContain('Based on {n} reviews');
    });

    it('defaults to a span host', () => {
        const html = renderToStaticMarkup(createElement(Phrase, null, 'x'));
        expect(html).toMatch(/^<span/);
    });
});
