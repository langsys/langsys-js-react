/**
 * langsys-js-react/next — Next.js integration.
 *
 *   // next.config.mjs
 *   import { withLangsys } from 'langsys-js-react/next';
 *   export default withLangsys({ ...yourConfig });
 *
 * `withLangsys` adds the placeholder transform (spec VAR-6) to both of Next's bundlers — a
 * Turbopack rule and a webpack rule that runs first — so an interpolation inside `<Translate>`,
 * `<Phrase>` or a `t()` call registers as one phrase with a placeholder. Next's own compiler (SWC)
 * stays on; the transform only touches files that mention `langsys-js-react`.
 */
import { fileURLToPath } from 'node:url';

const LOADER = fileURLToPath(new URL('./next-loader.js', import.meta.url));
const GLOBS = ['*.tsx', '*.jsx', '*.ts', '*.js', '*.mts', '*.mjs'];

interface WebpackConfig {
    module?: { rules?: unknown[] };
}
export interface NextConfigLike {
    turbopack?: { rules?: Record<string, unknown> } & Record<string, unknown>;
    webpack?: ((config: WebpackConfig, context: unknown) => WebpackConfig) | null;
    [key: string]: unknown;
}

/**
 * Turbopack runs the loader only on the app's own files (not `foreign`, i.e. not node_modules)
 * whose content mentions the package; the output stays the same kind of module.
 */
const TURBOPACK_RULE = {
    loaders: [LOADER],
    condition: { all: [{ not: 'foreign' }, { content: /langsys-js-react/ }] },
};

export function withLangsys<T extends NextConfigLike>(config: T = {} as T): T {
    const rules: Record<string, unknown> = { ...(config.turbopack?.rules ?? {}) };
    for (const glob of GLOBS) {
        const existing = rules[glob];
        // An app's own rule for the same files is kept; ours is added beside it.
        rules[glob] = existing === undefined ? TURBOPACK_RULE : [...(Array.isArray(existing) ? existing : [existing]), TURBOPACK_RULE];
    }

    const userWebpack = config.webpack;
    return {
        ...config,
        turbopack: { ...(config.turbopack ?? {}), rules },
        webpack(webpackConfig: WebpackConfig, context: unknown) {
            const next = typeof userWebpack === 'function' ? userWebpack(webpackConfig, context) : webpackConfig;
            next.module ??= {};
            next.module.rules ??= [];
            next.module.rules.push({
                test: /\.(?:[cm]?[jt]sx?)$/,
                exclude: /node_modules/,
                enforce: 'pre',
                use: [{ loader: LOADER }],
            });
            return next;
        },
    };
}
