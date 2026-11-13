// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LangsysApp, createLocaleStore, currentlyLoadedLocale, type iLangsysInitConfig } from './index.js';
import { startContractFixture, until, type ContractFixture } from './test-helpers/contract-fixture.js';
import seeds from './test-helpers/contract-seeds/ref1-lists.js';
import type { World } from './test-helpers/contract-worlds.js';

/**
 * REF-1's binding clause, against the API on an SDK test clone (spec CONF-2): a list call made
 * through this package answers the core's held list with no further request, and the binding
 * sends no request of its own.
 *
 * The lists are the core's: `LangsysApp` is the core singleton by reference (BIND-6). The case's
 * crafted lists answer each display locale with a list named in it, so each locale's list is its
 * own. A call that must not send is shown twice over: the case's lists are changed after the first
 * read, so a read would answer a different list, and the call still answers the one it held; and
 * every request sent is counted at the transport seam, `fetch`.
 */

let fx: ContractFixture;
let w: World;

const REFERENCE = {
    locales: ['es-es', 'en-us', 'fr-fr'],
    countries: [{ code: 'ES' }, { code: 'CR' }],
    dial_codes: [{ country_code: 'ES', dial_code: '34' }, { country_code: 'CR', dial_code: '506' }],
    currencies: [{ code: 'EUR', name: 'Euro', symbol: '€' }, { code: 'CRC', name: 'Costa Rican Colón', symbol: '₡' }],
};
/** Lists a read made after the change would answer instead. They keep fr-fr, the display locale read only after the change. */
const CHANGED = {
    locales: ['it-it', 'es-es', 'en-us', 'fr-fr'],
    countries: [{ code: 'IT' }],
    dial_codes: [{ country_code: 'IT', dial_code: '39' }],
    currencies: [{ code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' }],
};

type Call = (locale?: string) => Promise<unknown>;
const LISTS: { name: string; route: string; call: Call }[] = [
    { name: 'getLocales', route: 'locales', call: (l) => LangsysApp.getLocales(l) },
    { name: 'getLocalesFlat', route: 'locales/flat', call: (l) => LangsysApp.getLocalesFlat(l) },
    { name: 'getLocalesData', route: 'locales/data', call: (l) => LangsysApp.getLocalesData(l) },
    { name: 'getCurrencies', route: 'currencies', call: (l) => LangsysApp.getCurrencies(l) },
    { name: 'getCountries', route: 'countries', call: (l) => LangsysApp.getCountries(l) },
    { name: 'getDialCodes', route: 'countries/dial-codes', call: (l) => LangsysApp.getDialCodes(l) },
];

/** WIRE-3's form of a locale code, which every locale form answers its codes in. */
const wire3 = (code: string) => code.replace(/_/g, '-').toLowerCase();
function wire3Codes(list: unknown): unknown {
    if (Array.isArray(list)) return list.map((row) => ({ ...row, code: wire3(row.code) }));
    return Object.fromEntries(Object.entries(list as Record<string, unknown>).map(([group, rows]) => [group, wire3Codes(rows)]));
}

/** The list the API answers for `locale` right now, read by the test itself under the case's key. */
async function apiList(route: string, locale: string): Promise<unknown> {
    const byLocale = route.startsWith('locales');
    const url = byLocale ? `/${route}?locales%5B%5D=${locale}&append_target_locales=0` : `/${route}/${locale}`;
    const { body } = await fx.api(url, { key: w.key('k1') });
    if (!byLocale) return body.data;
    const [, entry] = Object.entries(body.data).find(([k]) => wire3(k) === locale) ?? [];
    return entry === undefined ? undefined : wire3Codes(entry);
}

/** `fetch` before any count: a second `vi.spyOn` returns the spy already in place, so it is taken once, here. */
const realFetch = globalThis.fetch;

/** The reference-list requests sent through `fetch` from here on: each a list route and display locale. */
function countListRequests(): string[] {
    const sent: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        const url = new URL(String(input instanceof Request ? input.url : input));
        if (/\/(locales|currencies|countries)\b/.test(url.pathname)) sent.push(url.pathname.replace(/^.*\/api\//, '') + url.search);
        return realFetch(input as string, init);
    });
    return sent;
}

beforeAll(async () => {
    fx = await startContractFixture();
    w = seeds.take('lists');
    await fx.use(w, { reference: REFERENCE });
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await LangsysApp.init({
        projectid: w.project(),
        key: w.key('k1'),
        UserLocaleStore: createLocaleStore('es-es'),
        baseLocale: 'en',
        apiUrl: fx.baseUrl,
    } as iLangsysInitConfig);
    await until(() => currentlyLoadedLocale.get() === 'es-es');
});
afterAll(async () => {
    vi.restoreAllMocks();
    await fx.stop();
});

describe('REF-1 — a list call through LangsysApp answers the core’s held list', () => {
    // Every list is read first, for the current locale and for en-us, so the core holds both.
    const first = new Map<string, { es: unknown; en: unknown }>();

    it('control: each list answers the API’s list for the current locale, and each locale’s list is its own', async () => {
        for (const { name, route, call } of LISTS) {
            const es = await call();
            const en = await call('en-us');
            expect(es, name).toEqual(await apiList(route, 'es-es'));
            expect(en, name).toEqual(await apiList(route, 'en-us'));
            expect(es, name).not.toEqual(en);
            first.set(name, { es, en });
        }
    });

    it('a second call for a held display locale sends no request and answers the held list, though the API’s lists have changed', async () => {
        await fx.update(w, { reference: CHANGED });
        for (const { route } of LISTS) expect(await apiList(route, 'es-es'), route).not.toEqual(first.get(LISTS.find((l) => l.route === route)!.name)!.es);
        const sent = countListRequests();
        for (const { name, call } of LISTS) {
            expect(await call(), name).toEqual(first.get(name)!.es);
            expect(await call('es-es'), name).toEqual(first.get(name)!.es);
            expect(await call('en-us'), name).toEqual(first.get(name)!.en);
        }
        expect(sent).toEqual([]);
    });

    it('a display locale not held is read once, and answers the API’s list for it', async () => {
        const sent = countListRequests();
        for (const { name, route, call } of LISTS) {
            const fr = await call('fr-fr');
            expect(fr, name).toEqual(await apiList(route, 'fr-fr'));
            expect(await call('fr-fr'), name).toEqual(fr);
        }
        // apiList reads through the fixture's own client, not `fetch`, so these are the SDK's alone:
        // one per list, none of the binding's own.
        expect(sent).toHaveLength(LISTS.length);
        expect(sent.every((path) => path.includes('fr-fr') || path.includes('fr_fr'))).toBe(true);
    });
});
