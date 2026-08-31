import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PHRASE_MARKER_ATTR, PHRASE_MARKER_ATTRS } from 'langsys-js-typescript';
import { Phrase } from './components/Phrase.js';
import { DontTranslate } from './components/DontTranslate.js';

/**
 * Marker attributes must come from the core, not from a literal in this repo.
 *
 * `src/components.test.ts` asserts the literal `data-ls-phrase` deliberately —
 * that is the independent verifier, and it is what pins today's value. This
 * file asserts the complementary half: that what we RENDER equals what the core
 * currently EXPORTS. A hardcoded literal passes the first and fails this one the
 * moment the core's constant moves, which is the drift that would otherwise ship
 * silently — the tokenizer would stop recognising our host while every local
 * test stayed green.
 */
describe('marker attributes are sourced from the core', () => {
    it('positive control: the core actually exports the constant', () => {
        expect(typeof PHRASE_MARKER_ATTR).toBe('string');
        expect(PHRASE_MARKER_ATTR.length).toBeGreaterThan(0);
    });

    it('<Phrase> renders the core\'s current marker, whatever it is', () => {
        const html = renderToStaticMarkup(createElement(Phrase, null, 'x'));
        // Boundary-anchored, not a substring test: a hardcoded superstring like
        // `data-ls-phrase-v2` contains the real marker and would satisfy
        // `toContain` while the core's tokenizer ignored it entirely.
        expect(html).toMatch(new RegExp(`(?:^|\\s)${PHRASE_MARKER_ATTR}(?=[=\\s>])`));
    });

    it('the rendered marker is one the core\'s tokenizer accepts', () => {
        // The core accepts an alias list; ours must be a member, not merely
        // equal to the primary name.
        const html = renderToStaticMarkup(createElement(Phrase, null, 'x'));
        expect(
            PHRASE_MARKER_ATTRS.some((attr) => new RegExp(`(?:^|\\s)${attr}(?=[=\\s>])`).test(html)),
        ).toBe(true);
    });

    it('<DontTranslate> uses the standard HTML attribute, which is not a core constant', () => {
        // `translate="no"` is HTML, not Langsys — the core has no constant for
        // it and hardcoding is correct. `data-ls-dont-translate` is this
        // wrapper's own styling/selection hook, likewise not the core's.
        const html = renderToStaticMarkup(createElement(DontTranslate, null, 'Kangen'));
        expect(html).toContain('translate="no"');
        expect(html).toContain('data-ls-dont-translate');
    });
});
