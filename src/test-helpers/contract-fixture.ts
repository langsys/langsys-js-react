import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { Declared, PhraseSeed, ProjectSeed, World } from './contract-worlds.js';

/**
 * Starts the contract fixture in its own process and hands back what a test needs: the base URL
 * to point the SDK at, and the forwarder's setup namespace. The fixture is an SDK test clone, a
 * real Langsys API seeded before the run, reached through `contract-fixture/forwarder.mjs` (spec
 * CONF-2).
 *
 * A case names its world with `use`, which gives the forwarder its keys, projects and user tokens,
 * its caller address, and any faults and crafted reference lists. There is deliberately no accessor
 * for what the fixture received: a test reads what the API holds through its routes, as a client
 * or the project's owner reads it. `hints` covers only what no route returns, the hints the clone
 * stored.
 */
export interface ContractFixture {
    baseUrl: string;
    fixtureUrl: string;
    /**
     * Names a case to the forwarder, from the world's own address with no faults or lists unless
     * given, once the API is seen to hold the world's seed: it rejects with "seed not landed"
     * otherwise.
     */
    use(world: World, setup?: CaseSetup): Promise<void>;
    /** Changes a case's setup, such as a move to another address; what it leaves out stays. */
    update(world: World, setup: CaseSetup): Promise<void>;
    /**
     * What the catalog serves for a project at a locale, read with `key`, by category: phrases by
     * text, blocks by custom id with their phrases. Sorted, since the API promises no order.
     */
    held(key: string, project: string, locale: string): Promise<HeldCatalog>;
    /** The blocks the world's project `role` holds, each with the content it stored, as its owner reads them. */
    storedBlocks(world: World, key: string, locale: string, role?: string): Promise<StoredBlock[]>;
    /** A call to the API under an API key, made by the test itself, never through a `fetch` a case has stubbed. */
    api(path: string, init?: { key?: string; method?: string; body?: unknown }): Promise<{ status: number; body: any }>;
    /** A call to the API's user routes as the seeded user who owns the world's project `role`. */
    asUser(world: World, path: string, init?: { method?: string; body?: unknown; role?: string }): Promise<{ status: number; body: any }>;
    /** The hints the clone stored for the world's projects, in the order it accepted them. */
    hints(world: World): Promise<Array<{ project_id: string; url: string }>>;
    advanceClock(seconds: number): Promise<void>;
    stop(): Promise<void>;
}

export interface CaseSetup {
    caller?: string;
    faults?: unknown[];
    /** Crafted reference lists, written in the locale-code format the world's seed gives its organisation, so a setup never names one. */
    reference?: Record<string, unknown> | null;
}

/** A catalog as the API serves it, by category, since a phrase's or block's category is part of what identifies it. */
export interface HeldCatalog {
    /** Phrase texts by the category they are served under. */
    phrases: Record<string, string[]>;
    /** Blocks by the category they are served under, then by custom id, each with its phrases. */
    blocks: Record<string, Record<string, string[]>>;
}

/** Every phrase text a catalog holds, under any category: what an absence is checked against. */
export const anyPhrase = (held: HeldCatalog) => Object.values(held.phrases).flat();

/** Every block id a catalog holds, under any category: what an absence is checked against. */
export const anyBlock = (held: HeldCatalog) => Object.values(held.blocks).flatMap((blocks) => Object.keys(blocks));

export interface StoredBlock {
    custom_id: string;
    category: string | null;
    content: string | null;
}

/** The fetch this module loaded with: a test's reads are not the SDK's traffic, so a test spying on `fetch` never sees them. */
const directFetch = globalThis.fetch.bind(globalThis);

/** A locale as the clone stores it. */
const formatLocale = (locale: string) => locale.toLowerCase().replaceAll('_', '-');

/** The category the catalog serves a seeded item under. */
const servedCategory = (category: string | null | undefined) => category || '__uncategorized__';

/** The translation a seeded phrase is given at a locale, if any. */
const seededAt = (phrase: Pick<PhraseSeed, 'translations'>, locale: string) => Object.entries(phrase.translations ?? {}).find(([given]) => formatLocale(given) === locale)?.[1];

/**
 * What the catalog serves a seeded phrase as at a locale, where its seed decides that: an
 * untranslatable phrase as null, and at a target locale a translation the seed gives, as given.
 * Otherwise the API decides, and only the phrase's presence is checked: at the base locale it
 * serves the phrase, or a stored ICU message in its place, so a translation seeded there is read
 * back as the item's own.
 */
function seededValue(phrase: Pick<PhraseSeed, 'translatable' | 'translations'>, locale: string, base: string): string | null | undefined {
    if (phrase.translatable === false) return null;
    return locale === base ? undefined : seededAt(phrase, locale);
}

/** Where a catalog read at `locale` differs from the phrases and blocks a project's seed declares. */
function catalogGaps(seed: ProjectSeed, locale: string, base: string, data: Record<string, Record<string, unknown>>): string[] {
    const gaps: string[] = [];
    const check = (served: Record<string, unknown> | undefined, phrase: Pick<PhraseSeed, 'phrase' | 'translatable' | 'translations'>, where: string) => {
        if (!served || !Object.prototype.hasOwnProperty.call(served, phrase.phrase)) {
            gaps.push(`"${phrase.phrase}" ${where} is not served at ${locale}`);
            return;
        }
        const seeded = seededValue(phrase, locale, base);
        if (seeded !== undefined && served[phrase.phrase] !== seeded) {
            gaps.push(`"${phrase.phrase}" ${where} is served at ${locale} as ${JSON.stringify(served[phrase.phrase])}, seeded ${JSON.stringify(seeded)}`);
        }
    };
    for (const phrase of seed.phrases ?? []) check(data[servedCategory(phrase.category)], phrase, `in ${servedCategory(phrase.category)}`);
    for (const block of seed.blocks ?? []) {
        const served = data[servedCategory(block.category)]?.[block.custom_id];
        if (!served || typeof served !== 'object') {
            gaps.push(`block ${block.custom_id} is not served at ${locale}`);
            continue;
        }
        for (const phrase of block.phrases ?? []) check(served as Record<string, unknown>, phrase, `in block ${block.custom_id}`);
    }
    return gaps;
}

/**
 * What a catalog read serves that a project's seed does not declare: a phrase, a block, or a
 * phrase inside a seeded block. A world a run has already written to holds what that run
 * registered, so its absences and first reads prove nothing until the clone is reseeded.
 */
function catalogExtras(seed: ProjectSeed, data: Record<string, Record<string, unknown>>): string[] {
    const phrases = new Set((seed.phrases ?? []).map((p) => JSON.stringify([servedCategory(p.category), p.phrase])));
    const blocks = new Map((seed.blocks ?? []).map((b) => [JSON.stringify([servedCategory(b.category), b.custom_id]), new Set((b.phrases ?? []).map((p) => p.phrase))]));
    const extras: string[] = [];
    for (const [category, entries] of Object.entries(data)) {
        for (const [name, value] of Object.entries(entries ?? {})) {
            const key = JSON.stringify([category, name]);
            if (value === null || typeof value !== 'object') {
                if (!phrases.has(key)) extras.push(`"${name}" in ${category}`);
                continue;
            }
            const seeded = blocks.get(key);
            if (!seeded) extras.push(`block ${name} in ${category}`);
            else for (const phrase of Object.keys(value)) if (!seeded.has(phrase)) extras.push(`"${phrase}" in block ${name}`);
        }
    }
    return extras;
}

interface Started {
    child: ChildProcess;
    ready: { base_url: string; fixture_url: string };
}

async function start(args: string[], env: Record<string, string>): Promise<Started> {
    const child: ChildProcess = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, ...env } });
    const ready = await new Promise<Started['ready']>((resolve, reject) => {
        let buffered = '';
        const timer = setTimeout(() => reject(new Error('contract fixture did not report ready within 20s')), 20_000);
        child.stdout!.on('data', (chunk: Buffer) => {
            buffered += chunk.toString('utf8');
            const newline = buffered.indexOf(String.fromCharCode(10));
            if (newline < 0) return;
            clearTimeout(timer);
            try {
                resolve(JSON.parse(buffered.slice(0, newline)));
            } catch (err) {
                reject(err);
            }
        });
        child.once('exit', (code) => {
            clearTimeout(timer);
            reject(new Error(`contract fixture exited early with code ${code}`));
        });
    });
    return { child, ready };
}

const stopper = (child: ChildProcess) => () =>
    new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
    });

/**
 * `LANGSYS_CONTRACT_TARGET` names the clone's origin and `LANGSYS_CONTRACT_CLONE_ROOT` its langsys
 * checkout, and without them this throws: a contract test never passes by skipping.
 * `LANGSYS_CONTRACT_LOG` names the file the forwarder logs to. `env` is added to the process's
 * environment.
 */
export async function startContractFixture(env: Record<string, string> = {}): Promise<ContractFixture> {
    const target = process.env.LANGSYS_CONTRACT_TARGET;
    const cloneRoot = process.env.LANGSYS_CONTRACT_CLONE_ROOT;
    const log = process.env.LANGSYS_CONTRACT_LOG;
    if (!target || !cloneRoot) {
        throw new Error(
            'The contract tests run against an SDK test clone, a real Langsys API (spec CONF-2), and none is named. ' +
                'Set LANGSYS_CONTRACT_TARGET to its origin, LANGSYS_CONTRACT_CLONE_ROOT to its langsys checkout, and NODE_EXTRA_CA_CERTS ' +
                'to the certificate it serves with: contract-fixture/README.md, "Running against an SDK test clone".'
        );
    }
    const { child, ready } = await start(
        [join(process.cwd(), 'contract-fixture', 'forwarder.mjs'), '--target', target, '--clone-root', cloneRoot, ...(log ? ['--log', log] : [])],
        env
    );

    const post = async (path: string, body: unknown) => {
        const res = await directFetch(ready.fixture_url + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
        if (!res.ok) throw new Error(`fixture ${path} answered ${res.status}: ${await res.text()}`);
    };
    const names = (world: World) => ({ keys: world.keys, projects: world.projects, tokens: world.tokens });
    const withFormat = (world: World, setup: CaseSetup): CaseSetup => {
        if (!setup.reference) return setup;
        if ('locale_code_format' in setup.reference) throw new Error(`${world.name}: a case's lists take the locale-code format its world's seed gives its organisation, so a setup does not name one`);
        const formats = [...new Set(world.declared.projects.map(({ seed }) => seed.locale_code_format ?? 'lowercase-hyphen'))];
        if (formats.length > 1) throw new Error(`${world.name}: its projects' organisations write locale codes as ${formats.join(' and ')}, and a case's lists take one format`);
        return { ...setup, reference: { ...setup.reference, locale_code_format: formats[0] ?? 'lowercase-hyphen' } };
    };
    const read = async (path: string, headers: Record<string, string>) => {
        const res = await directFetch(ready.base_url + path, { headers: { accept: 'application/json', ...headers } });
        const body = (await res.json().catch(() => null)) as { data?: unknown } | null;
        if (!res.ok || !body) throw new Error(`${path} answered ${res.status}`);
        return body.data;
    };
    const call = async (path: string, method: string | undefined, headers: Record<string, string>, payload: unknown) => {
        const res = await directFetch(ready.base_url + path, {
            method: method ?? (payload === undefined ? 'GET' : 'POST'),
            headers: { accept: 'application/json', 'content-type': 'application/json', ...headers },
            body: payload === undefined ? undefined : JSON.stringify(payload),
        });
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : null };
    };
    const asUser: ContractFixture['asUser'] = async (world, path, init = {}) => {
        const user = world.user(init.role);
        return call(path, init.method, { authorization: `Bearer ${user.token}`, 'x-device-id': user.device_id }, init.body);
    };

    const hints: ContractFixture['hints'] = async (world) => {
        const query = world.projects.map((p) => `project=${encodeURIComponent(p)}`).join('&');
        const res = await directFetch(`${ready.fixture_url}/state?${query}`);
        if (!res.ok) throw new Error(`fixture /state answered ${res.status}: ${await res.text()}`);
        return ((await res.json()) as { hints: Array<{ project_id: string; url: string }> }).hints;
    };

    /** A read as a project's owner, asking for ICU as the SDK does, so a seeded ICU message reads back as itself. */
    const ownerRead = async (world: World, role: string, path: string) => {
        const user = world.user(role);
        const res = await directFetch(ready.base_url + path, {
            headers: { accept: 'application/json', authorization: `Bearer ${user.token}`, 'x-device-id': user.device_id, 'x-langsys-capabilities': 'icu' },
        });
        return { status: res.status, body: (await res.json().catch(() => null)) as any };
    };

    /**
     * Where what the API holds for one of a world's projects differs from its seed, as the
     * project's owner reads it: its keys on every field the key listing returns; its settings as
     * its own read returns them; the catalog at its base locale, which holds exactly what the seed
     * declares, and at each target locale where it seeds phrases or blocks; and, as each item's
     * own, a block's markup and a phrase's translation seeded at the base locale. A suspended
     * project answers every catalog read 402 `subscription_suspended`, its owner's too, which is
     * its seed landing, and no route reads its content.
     */
    const projectGaps = async (world: World, project: Declared['projects'][number]): Promise<string[]> => {
        const { role, seed } = project;
        const read = (path: string) => ownerRead(world, role, path);
        const query = (locale: string) => `project_id=${encodeURIComponent(project.id)}&locale=${encodeURIComponent(locale)}`;
        const base = formatLocale(seed.base_locale ?? 'en-us');

        const keyGaps = async () => {
            const listed = await read(`/api-keys?project_id=${encodeURIComponent(project.id)}`);
            if (listed.status !== 200) return [`${role}'s key listing answered ${listed.status}`];
            const rows = new Map<string, any>((Array.isArray(listed.body?.data) ? listed.body.data : []).map((row: any) => [row.id, row]));
            return world.declared.keys
                .filter((key) => key.project === project.id)
                .flatMap((key) => {
                    const row = rows.get(key.id);
                    if (!row) return [`key ${key.role} (${key.id}) is not listed`];
                    const held = { type: row.type, ip_allowlist: row.ip_allowlist ?? null, active: row.active, write_grant_secret: row.write_grant_secret_set_at != null };
                    const seeded = { type: key.type, ip_allowlist: key.ip_allowlist, active: true, write_grant_secret: key.write_grant_secret };
                    return isDeepStrictEqual(held, seeded) ? [] : [`key ${key.role} is ${JSON.stringify(held)}, seeded ${JSON.stringify(seeded)}`];
                });
        };
        const catalogGapsAt = async (locale: string) => {
            const res = await read(`/translations?${query(locale)}`);
            if (seed.subscription_suspended) {
                return res.status === 402 && res.body?.error?.code === 'subscription_suspended' ? [] : [`${role} is not suspended: its catalog answered ${res.status}`];
            }
            if (res.status !== 200) return [`${role}'s catalog at ${locale} answered ${res.status}`];
            const data = res.body?.data ?? {};
            const gaps = catalogGaps(seed, locale, base, data).map((gap) => `${role}: ${gap}`);
            if (locale !== base) return gaps;
            const extras = catalogExtras(seed, data);
            return extras.length ? [...gaps, `${role} holds ${extras.join(', ')}, which its seed does not: a run has used this world, so reseed the clone`] : gaps;
        };
        // The settings the project's own read returns, as the seeder writes them.
        const settingsGaps = async () => {
            const res = await read(`/projects/${encodeURIComponent(project.id)}`);
            if (res.status !== 200) return [`${role}'s project read answered ${res.status}`];
            const data = res.body?.data ?? {};
            const locales = data.settings?.locales ?? {};
            const held = {
                website_url: data.website_url ?? null,
                base_locale: formatLocale(locales.base_locale ?? ''),
                target_locales: (locales.target_locales ?? []).map(formatLocale).sort(),
                discovery_base_locale_only: locales.discovery_base_locale_only ?? false,
                machine_translate_new_phrases: data.settings?.ai_translator?.machine_translate_new_phrases ?? null,
            };
            const seeded = {
                website_url: seed.website_url ?? null,
                base_locale: base,
                target_locales: (seed.target_locales ?? []).map(formatLocale).sort(),
                discovery_base_locale_only: seed.discovery_base_locale_only ?? false,
                machine_translate_new_phrases: seed.machine_translate_new_phrases ?? false,
            };
            return isDeepStrictEqual(held, seeded) ? [] : [`${role}'s settings are ${JSON.stringify(held)}, seeded ${JSON.stringify(seeded)}`];
        };
        // A block's markup, and a phrase's translation seeded at the base locale, read as the item's own.
        const baseTranslated = (seed.phrases ?? []).filter((phrase) => phrase.translatable !== false && seededAt(phrase, base) !== undefined);
        const itemGaps = async () => {
            const rows = await read(`/translations/data?${query(base)}`);
            if (rows.status !== 200) return [`${role}'s catalog rows answered ${rows.status}`];
            const blockIds = new Map<string, string>();
            const phraseIds = new Map<string, string>();
            for (const [category, items] of Object.entries((rows.body?.data ?? {}) as Record<string, any[]>)) {
                for (const row of items) {
                    if (row?.type === 'content_block' && row.custom_id) blockIds.set(row.custom_id, row.id);
                    if (row?.type === 'phrase') phraseIds.set(JSON.stringify([category, row.phrase]), row.id);
                }
            }
            const owned = async (id: string | undefined, what: string, check: (data: any) => string | null) => {
                if (!id) return [`${role}: ${what} has no row`];
                const item = await read(`/translatable-items/${encodeURIComponent(id)}`);
                if (item.status !== 200) return [`${role}: ${what}'s read answered ${item.status}`];
                const gap = check(item.body?.data ?? {});
                return gap ? [`${role}: ${what} ${gap}`] : [];
            };
            const found = await Promise.all([
                ...(seed.blocks ?? []).map((block) =>
                    owned(blockIds.get(block.custom_id), `block ${block.custom_id}`, (data) =>
                        (data.content ?? null) === (block.content ?? null) ? null : `holds ${JSON.stringify(data.content ?? null)}, seeded ${JSON.stringify(block.content)}`
                    )
                ),
                ...baseTranslated.map((phrase) =>
                    owned(phraseIds.get(JSON.stringify([servedCategory(phrase.category), phrase.phrase])), `"${phrase.phrase}" in ${servedCategory(phrase.category)}`, (data) =>
                        data.translation === seededAt(phrase, base) ? null : `holds ${JSON.stringify(data.translation ?? null)} at ${base}, seeded ${JSON.stringify(seededAt(phrase, base))}`
                    )
                ),
            ]);
            return found.flat();
        };

        // The base locale's catalog is read for every project, so a world a run has written to is caught.
        const checks = [keyGaps(), catalogGapsAt(base)];
        if (!seed.subscription_suspended) {
            checks.push(settingsGaps());
            if (seed.phrases?.length || seed.blocks?.length) checks.push(...(seed.target_locales ?? []).map(formatLocale).map(catalogGapsAt));
            if (seed.blocks?.length || baseTranslated.length) checks.push(itemGaps());
        }
        return (await Promise.all(checks)).flat();
    };

    /**
     * Confirms through the API that a world's seed landed before its case acts (spec CONF-2), so a
     * seed that did not land fails as one instead of passing an absence vacuously, and that no run
     * has written to the world since, as its catalog and the hints stored for it show. Every read is
     * the project's owner's, from the case's own address: an owner's read is metered against no
     * usage and counted by no duplicate guard, so the case observes none of them. A key attached
     * to no project answers as an unknown key does, so no read tells it landed and none is made.
     */
    const confirmSeed = async (world: World) => {
        const [gaps, stored] = await Promise.all([Promise.all(world.declared.projects.map((project) => projectGaps(world, project))), hints(world)]);
        const all = gaps.flat();
        if (stored.length) all.push(`the clone holds ${stored.length} hint(s) for its projects, which its seed does not: a run has used this world, so reseed the clone`);
        if (all.length) throw new Error(`seed not landed: ${world.name} ${all.join('; ')}`);
    };

    return {
        baseUrl: ready.base_url,
        fixtureUrl: ready.fixture_url,
        // The seed is confirmed before the case's faults and lists are set, which its reads would spend.
        use: async (world, given = {}) => {
            const setup = withFormat(world, given);
            const caller = setup.caller ?? world.address;
            await post('/setup', { ...names(world), caller, faults: [], reference: null });
            await confirmSeed(world);
            if (setup.faults?.length || setup.reference) await post('/setup', { ...names(world), caller, faults: setup.faults ?? [], reference: setup.reference ?? null });
        },
        update: async (world, setup) => post('/setup', { ...names(world), ...withFormat(world, setup) }),
        held: async (key, project, locale) => {
            const data = await read(`/translations?project_id=${encodeURIComponent(project)}&locale=${encodeURIComponent(locale)}`, { 'x-Authorization': key });
            const held: HeldCatalog = { phrases: {}, blocks: {} };
            for (const [category, entries] of Object.entries(data && typeof data === 'object' && !Array.isArray(data) ? data : {})) {
                if (!entries || typeof entries !== 'object') continue;
                for (const [name, value] of Object.entries(entries)) {
                    if (value && typeof value === 'object') (held.blocks[category] ??= {})[name] = Object.keys(value).sort();
                    else (held.phrases[category] ??= []).push(name);
                }
            }
            for (const phrases of Object.values(held.phrases)) phrases.sort();
            return held;
        },
        storedBlocks: async (world, key, locale, role = 'p1') => {
            const project = world.project(role);
            const rows = (await read(`/translations/data?project_id=${encodeURIComponent(project)}&locale=${encodeURIComponent(locale)}`, { 'x-Authorization': key })) as Record<
                string,
                Array<{ id: string; type: string; custom_id: string | null; category: string | null }>
            >;
            const blocks: StoredBlock[] = [];
            for (const row of Object.values(rows && !Array.isArray(rows) ? rows : {}).flat()) {
                if (row.type !== 'content_block') continue;
                const item = await asUser(world, `/translatable-items/${encodeURIComponent(row.id)}`, { role });
                if (item.status !== 200) throw new Error(`the owner's read of block ${row.custom_id} answered ${item.status}: ${JSON.stringify(item.body)}`);
                blocks.push({ custom_id: row.custom_id ?? '', category: row.category, content: item.body.data.content ?? null });
            }
            return blocks.sort((a, b) => a.custom_id.localeCompare(b.custom_id));
        },
        api: (path, init = {}) => call(path, init.method, init.key ? { 'x-authorization': init.key } : {}, init.body),
        asUser,
        hints,
        advanceClock: (seconds) => post('/clock', { advance_seconds: seconds }),
        stop: stopper(child),
    };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Polls `check` until it holds. Every poll is a real read from the case's own address, where the
 * API allows 120 requests a minute, so it polls once a second and leaves the rest to the SDK
 * under test.
 */
export async function until(check: () => boolean | Promise<boolean>, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await sleep(1000);
    }
    throw new Error(`condition not met within ${timeoutMs}ms`);
}
