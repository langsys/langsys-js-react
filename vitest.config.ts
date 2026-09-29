import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import langsys from './src/transform/vite';

export default defineConfig({
    // The placeholder transform runs on every test module, as it does in an app. Fixtures import
    // the package by its name, which resolves to this source.
    plugins: [langsys()],
    resolve: {
        alias: [{ find: /^langsys-js-react$/, replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) }],
    },
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
});
