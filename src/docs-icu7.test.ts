// ICU-7: every surface this package ships shows phrases flat (`You have {count} new messages`)
// and never writes a `plural`, `select` or `selectordinal` into a phrase. No network.
//
// A construct is allowed only in a passage named in EXEMPT below, which says which of the three
// roles ICU has in documentation it serves. A new ICU example fails here until someone decides it
// belongs in one of them and names it. CHANGELOG.md records what earlier releases did and is
// outside the rule.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ICU_CONSTRUCT, scanSurface, type ExemptPassage } from './test-helpers/icu-docs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The three roles ICU has in documentation, as named passages. */
const EXEMPT: readonly ExemptPassage[] = [
    {
        // Role: what the catalog returns. The README says what a translation can hold, for the reader
        // who wonders what `name_gender` is; the phrase the developer writes stays `{name}`.
        file: 'README.md',
        role: 'catalog',
        text: '{name_gender, select, …}',
        mark: 'in the translation',
    },
    {
        // Role: a counter-example, marked wrong beside the flat phrase that replaces it.
        file: 'README.md',
        role: 'counter-example',
        text: "t('{count, plural, one {# new message} other {# new messages}}', 'Inbox', { count });",
        mark: '❌',
        flatBeside: '✅',
    },
    // Role `mig-4` (what MIG-4 converts a legacy plural file into): no passage serves it today. The
    // README's legacy-keys section says a key becomes "Langsys placeholders and ICU plurals" in
    // prose, with no construct in it.
];

const TEXT = /\.(md|ts|tsx|mts|mjs|cjs|js|jsx|json|html|css)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.git']);
const SKIP_FILES = new Set(['package-lock.json']);

function walk(dir: string): string[] {
    return readdirSync(join(ROOT, dir)).flatMap((name) => {
        const path = dir === '' ? name : `${dir}/${name}`;
        if (SKIP_DIRS.has(name)) return [];
        return statSync(join(ROOT, path)).isDirectory() ? walk(path) : TEXT.test(name) && !SKIP_FILES.has(name) ? [path] : [];
    });
}

/** Root documents outside the rule, each for its reason. A new root document must be scanned or named here. */
const OUTSIDE = new Map<string, string>([
    ['CHANGELOG.md', 'a changelog records what earlier releases did'],
    ['CONFORMANCE.md', 'the grading of this package against the spec, written for its maintainers, not shipped to developers'],
    ['CLAUDE.md', 'guidance for the maintainers\' coding agent, not shipped to developers'],
]);

const rootDocs = readdirSync(ROOT).filter((n) => n.endsWith('.md'));
const SURFACES = [
    ...rootDocs.filter((n) => !OUTSIDE.has(n)), // README.md, README-SSR.md, TESTING.md, and any document added later
    ...walk('_dev_').filter((p) => p.endsWith('.md')),
    ...walk('example'),
    ...walk('example-next'),
].map((p) => p.split(sep).join('/'));

describe('ICU-7: documentation shows phrases flat', () => {
    it('scans the README, the SSR guide, the testing guide and every example and demo file', () => {
        for (const expected of ['README.md', 'README-SSR.md', 'TESTING.md', 'example/App.tsx', 'example/Checks.tsx', 'example/Testbed.tsx', 'example-next/app/[locale]/page.tsx', 'example-next/app/Client.tsx']) {
            expect(SURFACES).toContain(expected);
        }
        for (const name of OUTSIDE.keys()) expect(SURFACES).not.toContain(name);
    });

    it('writes no plural, select or selectordinal into a phrase, outside the named exempt passages', () => {
        const findings = SURFACES.flatMap((file) => scanSurface(file, readFileSync(join(ROOT, file), 'utf8'), EXEMPT));
        expect(findings.map((f) => `${f.file}:${f.line} ${f.problem}`)).toEqual([]);
    });

    it('has every exempt passage in a scanned surface', () => {
        for (const passage of EXEMPT) expect(SURFACES).toContain(passage.file);
    });
});

describe('ICU-7: the check fails on what it exists to catch', () => {
    const flat = ['`You have {count} new messages`', "t('You have {count} new messages', 'Inbox', { count });"].join('\n');

    it('passes flat phrases', () => {
        expect(scanSurface('x.md', flat, [])).toEqual([]);
    });

    it.each([
        ['a t() argument', "t('{count, plural, one {# item} other {# items}}', 'Cart', { count });"],
        ['a t() argument with no spaces', "t('{n,plural,one{# item}other{# items}}', 'Cart', { n });"],
        ['<Translate> content', '<Translate category="Cart">{count, plural, one {# item} other {# items}}</Translate>'],
        ['<Phrase> content', '<Phrase>{gender, select, female {She} other {They}} replied</Phrase>'],
        ['a phrase in prose', 'Write `{place, selectordinal, one {#st} two {#nd} other {#th}}` and it works.'],
        ['a select', "t('{who_gender, select, male {He} other {They}} left', 'UI', { who_gender })"],
        ['a demo file', "export const msg = t('{count, plural, =0 {None} other {# left}}', 'Demo', { count });"],
    ])('fails on %s', (_name, text) => {
        const findings = scanSurface('example/App.tsx', text, []);
        expect(findings).toHaveLength(1);
        expect(findings[0].problem).toContain('ICU construct in a phrase');
    });

    it('ignores the words plural and select where no argument uses them', () => {
        expect(scanSurface('x.md', '`<select>` picks a locale; pluralization needs the count and its noun in one phrase; a {select} placeholder', [])).toEqual([]);
        expect(ICU_CONSTRUCT.flags).toContain('g');
    });

    const counterExample: ExemptPassage = {
        file: 'x.md',
        role: 'counter-example',
        text: "t('{count, plural, one {#} other {#}}', 'A', { count });",
        mark: '❌',
        flatBeside: '✅',
    };
    const marked = ["t('You have {count} new messages', 'A', { count });  // ✅", "t('{count, plural, one {#} other {#}}', 'A', { count });  // ❌ ICU written by hand"].join('\n');

    it('allows a counter-example marked wrong beside its flat replacement', () => {
        expect(scanSurface('x.md', marked, [counterExample])).toEqual([]);
    });

    it('fails an exempt passage edited to lose its marking', () => {
        const findings = scanSurface('x.md', marked.replace('❌', ''), [counterExample]);
        expect(findings.map((f) => f.problem)).toEqual([expect.stringContaining('lost its marking')]);
    });

    it('fails a counter-example whose flat replacement is gone', () => {
        const findings = scanSurface('x.md', marked.split('\n')[1], [counterExample]);
        expect(findings.map((f) => f.problem)).toEqual([expect.stringContaining('no flat replacement')]);
    });

    it('fails a second copy of an exempt passage, and a construct outside it', () => {
        const twice = `${marked}\n${marked.split('\n')[1]}`;
        expect(scanSurface('x.md', twice, [counterExample]).map((f) => f.problem)).toEqual([
            expect.stringContaining('more than once'),
            expect.stringContaining('ICU construct in a phrase'),
        ]);
        const other = `${marked}\nt('{n, plural, one {#} other {#}}', 'A', { n });`;
        expect(scanSurface('x.md', other, [counterExample]).map((f) => f.problem)).toEqual([expect.stringContaining('ICU construct in a phrase')]);
    });

    it('fails an exempt passage that no longer exists, so a reworded passage is decided again', () => {
        expect(scanSurface('x.md', flat, [counterExample]).map((f) => f.problem)).toEqual([expect.stringContaining('not found')]);
    });

    it('does not scan the changelog', () => {
        expect(OUTSIDE.has('CHANGELOG.md')).toBe(true);
    });
});
