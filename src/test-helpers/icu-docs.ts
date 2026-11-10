// The documentation check behind ICU-7: phrases are written flat, so no surface this package ships
// writes a `plural`, `select` or `selectordinal` into a phrase. ICU appears in three roles only,
// each a named exempt passage (see `docs-icu7.test.ts`): what the catalog returns, what MIG-4
// converts a legacy plural file into, and a counter-example marked wrong beside its flat phrase.

/** An ICU argument that selects a branch: `{count, plural, …}`, `{name_gender, select, …}`. */
export const ICU_CONSTRUCT = /\{\s*[A-Za-z_][\w.]*\s*,\s*(?:plural|select|selectordinal)\b/g;

export type ExemptRole = 'catalog' | 'mig-4' | 'counter-example';

export interface ExemptPassage {
    /** Path from the repository root, forward slashes. */
    file: string;
    role: ExemptRole;
    /** Text the passage must contain exactly once in the file; every construct it exempts sits inside it. */
    text: string;
    /** The passage's line must also hold this, which is what shows it for what it is (`❌`, or the words that say a translation holds it). */
    mark: string;
    /** `counter-example` only: an adjacent line holding this, with no construct in it, is the flat phrase that replaces it. */
    flatBeside?: string;
}

export interface Finding {
    file: string;
    line: number;
    problem: string;
}

const lineOf = (text: string, index: number): number => text.slice(0, index).split('\n').length;

/** What is wrong in one surface: an ICU construct no exempt passage covers, or an exempt passage that is missing, repeated or no longer marked. */
export function scanSurface(file: string, text: string, exempt: readonly ExemptPassage[]): Finding[] {
    const findings: Finding[] = [];
    const lines = text.split('\n');
    const spans: Array<[number, number]> = [];

    for (const passage of exempt.filter((p) => p.file === file)) {
        const first = text.indexOf(passage.text);
        if (first === -1) {
            findings.push({ file, line: 0, problem: `exempt passage (${passage.role}) not found: ${JSON.stringify(passage.text)}` });
            continue;
        }
        const line = lineOf(text, first);
        if (text.indexOf(passage.text, first + 1) !== -1) {
            findings.push({ file, line, problem: `exempt passage (${passage.role}) appears more than once: ${JSON.stringify(passage.text)}` });
        }
        spans.push([first, first + passage.text.length]);
        const own = lines[line - 1] ?? '';
        if (!own.includes(passage.mark)) {
            findings.push({ file, line, problem: `exempt passage (${passage.role}) lost its marking ${JSON.stringify(passage.mark)}` });
        }
        if (passage.role === 'counter-example') {
            const beside = [lines[line - 2], lines[line]].filter(
                (l): l is string => l !== undefined && passage.flatBeside !== undefined && l.includes(passage.flatBeside) && !new RegExp(ICU_CONSTRUCT.source).test(l),
            );
            if (beside.length === 0) {
                findings.push({ file, line, problem: `counter-example has no flat replacement (a line holding ${JSON.stringify(passage.flatBeside)}) beside it` });
            }
        }
    }

    for (const match of text.matchAll(ICU_CONSTRUCT)) {
        const at = match.index ?? 0;
        if (!spans.some(([from, to]) => at >= from && at < to)) {
            const line = lineOf(text, at);
            findings.push({ file, line, problem: `ICU construct in a phrase, not an exempt passage: ${(lines[line - 1] ?? '').trim()}` });
        }
    }
    return findings;
}
