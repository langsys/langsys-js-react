import { defineConfig } from 'tsup';

export default defineConfig({
    // `server` is node-only (it imports node:async_hooks), so it is its own entry, never in the main bundle.
    entry: ['src/index.ts', 'src/server.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2021',
    treeshake: true,
    splitting: false,
    minify: false,
    // React is provided by the consuming app — never bundle it.
    external: ['react', 'react-dom'],
});
