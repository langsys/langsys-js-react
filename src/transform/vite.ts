/**
 * langsys-js-react/vite — the placeholder transform (spec VAR-6) as a Vite plugin.
 *
 *   // vite.config.ts
 *   import react from '@vitejs/plugin-react';
 *   import langsys from 'langsys-js-react/vite';
 *   export default defineConfig({ plugins: [langsys(), react()] });
 *
 * It runs before other transforms and only parses files that mention `langsys-js-react`; every
 * other file is left to Vite's own compiler.
 */
import { transformSource } from './run.js';

/** The part of Vite's plugin shape this plugin uses. */
export interface LangsysVitePlugin {
    name: string;
    enforce: 'pre';
    transform(
        this: { warn(message: string): void },
        code: string,
        id: string,
    ): Promise<{ code: string; map: unknown } | null>;
}

export default function langsys(): LangsysVitePlugin {
    return {
        name: 'langsys-placeholders',
        enforce: 'pre',
        async transform(code, id) {
            const out = await transformSource(code, id);
            if (!out) return null;
            for (const w of out.warnings) this.warn(w);
            return { code: out.code, map: out.map };
        },
    };
}
