/**
 * The placeholder transform over one source file, shared by the Vite plugin and the Next loader.
 * Files that never mention `langsys-js-react` are returned untouched without being parsed.
 */
import { transformAsync } from '@babel/core';
import langsysPlaceholders, { type LangsysTransformMetadata } from './babel.js';

export interface TransformResult {
    code: string;
    map: unknown;
    /** Human-readable build warnings, one per unnameable expression (spec VAR-2). */
    warnings: string[];
}

const SCRIPT = /\.(?:[cm]?[jt]sx?)$/;

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
    const out = await transformAsync(code, {
        filename: file,
        babelrc: false,
        configFile: false,
        sourceMaps,
        plugins: [langsysPlaceholders],
        parserOpts: { plugins: [...(isJsx ? (['jsx'] as const) : []), ...(isTs ? (['typescript'] as const) : [])] },
        generatorOpts: { retainLines: false },
    });
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
