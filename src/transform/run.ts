/**
 * The placeholder transform over one source file, shared by the Vite plugin and the Next loader.
 * Files that never mention `langsys-js-react` are returned untouched without being parsed.
 */
import { transformAsync } from '@babel/core';
import langsysPlaceholders, { type LangsysTransformMetadata } from './babel.js';

export interface TransformResult {
    /** The rewritten file, or null when it is left as written (see `warnings`). */
    code: string | null;
    map: unknown;
    /** Human-readable build warnings: one per unnameable expression (spec VAR-2), or why the file was left as written. */
    warnings: string[];
}

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;

type ParserPlugins = NonNullable<NonNullable<Parameters<typeof transformAsync>[1]>['parserOpts']>['plugins'];

/**
 * The syntaxes tried, in order, until one parses the file. Decorators come in two forms no single
 * parser setting reads: TypeScript's (`experimentalDecorators`, parameter decorators included) and
 * the standard proposal's (`export @dec class`); both take `accessor` fields. A `.js` file may
 * also be Flow-typed. Each setting only adds syntax, so a file both read parses the same way.
 */
function syntaxes(isTs: boolean, isJsx: boolean): ParserPlugins[] {
    const base: ParserPlugins = [...(isJsx ? (['jsx'] as const) : []), ...(isTs ? (['typescript'] as const) : [])];
    const out: ParserPlugins[] = [
        [...base!, 'decorators-legacy', 'decoratorAutoAccessors'],
        [...base!, ['decorators', {}], 'decoratorAutoAccessors'],
    ];
    if (!isTs) out.push([...base!, 'flow', 'decorators-legacy']);
    return out;
}

/** Whether a file is worth parsing: a script outside node_modules that mentions the package. */
export function wants(code: string, filename: string): boolean {
    const file = filename.split('?')[0];
    return SCRIPT.test(file) && !file.includes('/node_modules/') && code.includes('langsys-js-react');
}

export async function transformSource(code: string, filename: string, sourceMaps = true): Promise<TransformResult | null> {
    if (!wants(code, filename)) return null;
    const file = filename.split('?')[0];
    const isTs = /\.[cm]?tsx?$/.test(file);
    const isJsx = /x$/.test(file) || /\.[cm]?js$/.test(file);
    let out: Awaited<ReturnType<typeof transformAsync>> = null;
    let unparsed: Error | null = null;
    for (const plugins of syntaxes(isTs, isJsx)) {
        try {
            out = await transformAsync(code, {
                filename: file,
                babelrc: false,
                configFile: false,
                sourceMaps,
                plugins: [langsysPlaceholders],
                parserOpts: { plugins },
                generatorOpts: { retainLines: false },
            });
            unparsed = null;
            break;
        } catch (err) {
            if ((err as { code?: string }).code !== 'BABEL_PARSE_ERROR') throw err;
            unparsed ??= err as Error;
        }
    }
    // The app's own compiler reads the file as it reads every other, and reports its own errors.
    if (unparsed) {
        const reason = unparsed.message.replace(`${file}: `, '').split('\n')[0];
        return {
            code: null,
            map: null,
            warnings: [
                `langsys: ${file} — Babel could not parse it (${reason}), so it is left as written ` +
                    'and the values in its <Translate>, <Phrase> and t() calls are not made placeholders.',
            ],
        };
    }
    const meta = (out?.metadata as unknown as { langsys?: LangsysTransformMetadata } | undefined)?.langsys;
    if (!out?.code || !meta || meta.rewritten === 0) return null;
    return {
        code: out.code,
        map: out.map ?? null,
        warnings: meta.warnings.map(
            (w) =>
                `langsys: ${file}${w.line ? `:${w.line}:${(w.column ?? 0) + 1}` : ''} — no placeholder name can be derived ` +
                `from \`${w.source}\`, so it is named {${w.name}}. Give it a name with %name% and params.`,
        ),
    };
}
