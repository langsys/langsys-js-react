import { defineConfig } from 'tsup';

export default defineConfig({
    // `server` is node-only (it imports node:async_hooks), so it is its own entry, never in the main bundle.
    entry: {
        index: 'src/index.ts',
        server: 'src/server.ts',
        // Build-time only: the placeholder transform (spec VAR-6) and its integrations.
        babel: 'src/transform/index.ts',
        vite: 'src/transform/vite.ts',
        next: 'src/next.ts',
        'next-loader': 'src/next-loader.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2021',
    treeshake: true,
    splitting: false,
    minify: false,
    // React is provided by the consuming app — never bundle it.
    external: ['react', 'react-dom', '@babel/core'],
    // `import.meta.url` in the CJS build of `next` (the loader's path).
    shims: true,
});
