/**
 * The loader `withLangsys` adds to Next's Turbopack and webpack builds: the placeholder transform
 * (spec VAR-6) on files that mention `langsys-js-react`. Next's own compiler (SWC) still compiles
 * everything.
 */
import { transformSource } from './transform/run.js';

interface LoaderContext {
    resourcePath: string;
    async(): (err: Error | null, code?: string, map?: unknown) => void;
    emitWarning?(warning: Error): void;
}

export default function langsysLoader(this: LoaderContext, source: string, map?: unknown): void {
    const done = this.async();
    transformSource(source, this.resourcePath).then(
        (out) => {
            if (!out) return done(null, source, map);
            for (const w of out.warnings) this.emitWarning?.(new Error(w));
            done(null, out.code, out.map ?? undefined);
        },
        (err: Error) => done(err),
    );
}
