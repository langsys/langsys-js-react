import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement as el } from 'react';
import { renderToString } from 'react-dom/server';
import { LangsysApp, Phrase, createLocaleStore, type iLangsysInitConfig } from './index.js';
import { clearSharedCatalogs, renderInRequestScope } from './server.js';
import { startContractFixture, sleep, until, type ContractFixture } from './test-helpers/contract-fixture.js';
import { phrasesIn } from './test-helpers/contract-held.js';
import seeds from './test-helpers/contract-seeds/srv2-credentials.js';
import type { World } from './test-helpers/contract-worlds.js';

/**
 * SRV-2's credentials clause, against the API on an SDK test clone (spec CONF-2): a server render
 * carries its project id and key on its request scope and sends under them, so two scopes in one
 * process never share a credential, and a scope given none sends under `init()`'s.
 *
 * The scope is the core's (`RequestScopeOptions.credentials`); this binding's half is that
 * `renderInRequestScope` hands its options to the core unchanged and renders inside the scope.
 * Each project holds `Pricing` translated its own way, so a render shows whose catalog it read;
 * under the `server` strategy each render's miss is sent at `close()`, and the API stores it in
 * the project of the key it came under, read back through each project's catalog. Every request
 * is also read at the transport seam: none names one project under another's key.
 */

let fx: ContractFixture;
let w: World;
const PROJECTS = ['p0', 'p1', 'p2'] as const;
const keyOf = (role: (typeof PROJECTS)[number]) => w.key(`k${role.slice(1)}`);
const held = (role: (typeof PROJECTS)[number]) => fx.held(keyOf(role), w.project(role), 'en');

const Page = ({ only }: { only: string }) =>
    el('div', null, el('p', null, el(Phrase, { category: 'UI' }, 'Pricing')), el('p', null, el(Phrase, { category: 'UI' }, only)));

/** Every request sent from here on, with the key it went under. */
let sent: Array<{ url: string; body: string; key: string | undefined }> = [];
const realFetch = globalThis.fetch;

/** One request's render, scoped with `credentials` when a project is named, opened beside any other. */
async function render(only: string, role?: 'p1' | 'p2') {
    const credentials = role ? { projectid: w.project(role), key: keyOf(role) } : undefined;
    return renderInRequestScope({ locale: 'es-es', ...(credentials ? { credentials } : {}) }, async () => {
        await sleep(50); // both scopes are open before either renders
        return renderToString(el(Page, { only }));
    });
}

beforeAll(async () => {
    fx = await startContractFixture();
    w = seeds.take('tenants');
    await fx.use(w);
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        sent.push({ url: String(input), body: typeof init?.body === 'string' ? init.body : '', key: headers['x-Authorization'] });
        return realFetch(input, init);
    }) as typeof fetch;
    await LangsysApp.init({
        projectid: w.project('p0'),
        key: keyOf('p0'),
        UserLocaleStore: createLocaleStore('en'),
        baseLocale: 'en',
        apiUrl: fx.baseUrl,
        ssrTokenStrategy: 'server',
    } as iLangsysInitConfig);
});
beforeEach(() => {
    clearSharedCatalogs();
    sent = [];
});
afterAll(async () => {
    globalThis.fetch = realFetch;
    await fx.stop();
});

/** The projects a request names, in its URL or body. */
const named = (r: { url: string; body: string }) => PROJECTS.filter((role) => (r.url + r.body).includes(w.project(role)));

describe('SRV-2 — a server render sends under its own scope’s credentials', () => {
    it('two concurrent renders under two projects each read their own catalog and send only under their own key', async () => {
        const [one, two] = await Promise.all([render('Only for one', 'p1'), render('Only for two', 'p2')]);
        expect(one.result).toContain('Precios uno');
        expect(one.result).not.toMatch(/Precios (dos|cero)/);
        expect(two.result).toContain('Precios dos');
        expect(two.result).not.toMatch(/Precios (uno|cero)/);
        await Promise.all([one.close(), two.close()]);

        // Each miss is stored in its own project, and in no other.
        await until(async () => phrasesIn(await held('p1'), 'UI').includes('Only for one') && phrasesIn(await held('p2'), 'UI').includes('Only for two'));
        await sleep(2000);
        expect(phrasesIn(await held('p1'), 'UI')).toEqual(['Only for one', 'Pricing']);
        expect(phrasesIn(await held('p2'), 'UI')).toEqual(['Only for two', 'Pricing']);
        expect(phrasesIn(await held('p0'), 'UI')).toEqual(['Pricing']);

        // At the transport seam: both keys were used, and no request names a project under another's key.
        const keys = new Set(sent.map((r) => r.key));
        expect(keys.has(keyOf('p1')) && keys.has(keyOf('p2'))).toBe(true);
        for (const r of sent) for (const role of named(r)) expect(r.key, r.url).toBe(keyOf(role));
    });

    it('a scope given no credentials reads and sends under init()’s', async () => {
        const zero = await render('Only for zero');
        expect(zero.result).toContain('Precios cero');
        expect(zero.result).not.toMatch(/Precios (uno|dos)/);
        await zero.close();
        await until(async () => phrasesIn(await held('p0'), 'UI').includes('Only for zero'));
        expect(phrasesIn(await held('p1'), 'UI')).not.toContain('Only for zero');
        expect(phrasesIn(await held('p2'), 'UI')).not.toContain('Only for zero');
        expect(new Set(sent.map((r) => r.key))).toEqual(new Set([keyOf('p0')]));
    });
});
