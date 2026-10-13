import { describe, expect, it, vi } from 'vitest';

/**
 * `langsys-js-react/server` loads no React, so a Next Server Component can import it to call
 * `LangsysApp.init()`. React is mocked to throw on import: the server entry must load anyway, and
 * the main entry, which imports React's hooks, must not, which proves the mock bites.
 */
vi.mock('react', () => {
    throw new Error('React was imported');
});

describe('langsys-js-react/server without React', () => {
    it('loads, and exports the core singleton and the locale store', async () => {
        const server = await import('./server.js');
        const core = await import('langsys-js-typescript');
        expect(server.LangsysApp).toBe(core.LangsysApp);
        expect(server.createLocaleStore('es-es').get()).toBe('es-es');
    });

    it('control: the main entry imports React', async () => {
        await expect(import('./index.js')).rejects.toThrow();
    });
});
