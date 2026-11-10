import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
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
        // Two projects. `unit` is `npm test`: no clone, no listening socket. `contract` is
        // `npm run test:contract`: the files that run against an SDK test clone, a real Langsys API
        // (spec CONF-2, contract-fixture/README.md), and throw without one, since a contract test
        // never passes by skipping. Every request there is a real one and the clock waits in real
        // time, so a case and a hook get the time a real API takes.
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
                    exclude: [...configDefaults.exclude, '**/*.contract.test.ts{,x}'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'contract',
                    include: ['src/**/*.contract.test.ts', 'src/**/*.contract.test.tsx'],
                    testTimeout: 200_000,
                    hookTimeout: 60_000,
                    // One file at a time: each is timing-sensitive against a real API.
                    fileParallelism: false,
                },
            },
        ],
    },
});
