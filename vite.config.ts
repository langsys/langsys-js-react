import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import langsys from './src/transform/vite';

/**
 * Config for the local playground in `example/` (run with `npm run dev`).
 * It is not part of the published package — the library itself is built with
 * tsup (see `tsup.config.ts`).
 *
 * The playground imports the SDK straight from `../src`, so edits to the
 * library hot-reload; `langsys-js-react` resolves to the same source, so a page
 * that imports the package by name runs through the placeholder transform, as an
 * app does. `.env` is read from the repo root (see `.env.example`).
 *
 * `/lsapi` and `/lsfixture` proxy to the contract double started by
 * `npm run fixture` (LANGSYS_FIXTURE_URL, default http://127.0.0.1:8787), so the
 * browser reaches it from the page's own origin. See TESTING.md.
 */
const fixture = process.env.LANGSYS_FIXTURE_URL ?? 'http://127.0.0.1:8787';

export default defineConfig({
    root: 'example',
    envDir: '..',
    plugins: [langsys(), react()],
    resolve: {
        alias: [{ find: /^langsys-js-react$/, replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) }],
    },
    server: {
        // Allow serving the library source that lives one level above `example/`.
        fs: { allow: ['..'] },
        proxy: {
            '/lsapi': { target: fixture, rewrite: (path) => path.replace(/^\/lsapi/, '/api') },
            '/lsfixture': { target: fixture, rewrite: (path) => path.replace(/^\/lsfixture/, '/__fixture') },
        },
    },
});
