import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import gate10 from './test-helpers/contract-seeds/gate10.js';
import hint13 from './test-helpers/contract-seeds/hint13.js';
import localeSwitch from './test-helpers/contract-seeds/locale-switch.js';
import playground from './test-helpers/contract-seeds/playground.js';
import ref1 from './test-helpers/contract-seeds/ref1-lists.js';
import mig from './test-helpers/contract-seeds/mig-passthrough.js';
import nested from './test-helpers/contract-seeds/nested-fallback.js';
import handoff from './test-helpers/contract-seeds/seed-handoff.js';
import srv2 from './test-helpers/contract-seeds/srv2-credentials.js';
import srv7 from './test-helpers/contract-seeds/srv7-served-block.js';
import transform from './test-helpers/contract-seeds/transform.js';
import var7 from './test-helpers/contract-seeds/var7-unregistered.js';
import { renderSeedFile, seedFile, type SeedFile } from './test-helpers/contract-worlds.js';

/**
 * The seed files the SDK test clone is built from before a run (spec CONF-2) are their worlds'
 * declarations, rendered. A file that differs from its declaration fails here; write them again
 * with `npx vitest run --project unit src/seed-files.test.ts -u`, and reseed the clone to take the
 * change. One refused seed file stops the reseed for every SDK sharing the clone, so this checks
 * each file against the clone's refusal table (langsys docs/sdk-test-clone.md, "What a document
 * may not carry") without a clone.
 */
const FILES: Record<string, SeedFile<string>> = {
    gate10,
    hint13,
    'locale-switch': localeSwitch,
    'mig-passthrough': mig,
    'nested-fallback': nested,
    playground,
    'ref1-lists': ref1,
    'seed-handoff': handoff,
    'srv2-credentials': srv2,
    'srv7-served-block': srv7,
    transform,
    'var7-unregistered': var7,
};
const FOLDER = join(__dirname, '..', '_dev_', 'contract', 'seeds');

describe('the seed files are what their worlds declare', () => {
    it.each(Object.entries(FILES))('%s.json', async (name, file) => {
        expect(file.slug).toBe(name);
        await expect(renderSeedFile(file)).toMatchFileSnapshot(`../_dev_/contract/seeds/${name}.json`);
    });
});

it('the folder holds no JSON but the seed files, since the seeder reads every JSON file in it at any depth', () => {
    const json = (readdirSync(FOLDER, { recursive: true }) as string[])
        .filter((path) => path.endsWith('.json'))
        .map((path) => relative(FOLDER, join(FOLDER, path)));
    expect(json.sort()).toEqual(
        Object.keys(FILES)
            .map((name) => `${name}.json`)
            .sort()
    );
});

type Doc = {
    projects: Array<Record<string, any>>;
    keys: Array<Record<string, any>>;
};
const docs = Object.entries(FILES).map(([name, file]) => [name, file.document as unknown as Doc] as const);

describe('each document is one the clone’s seeder accepts', () => {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const PROJECT_FIELDS = [
        'id',
        'title',
        'base_locale',
        'target_locales',
        'website_url',
        'discovery_base_locale_only',
        'locale_code_format',
        'subscription_suspended',
        'human_translation_word_limit',
        'human_translation_words_used',
        'credits_exhausted',
        'machine_translate_new_phrases',
        'phrases',
        'blocks',
        'user',
        'machine_translations',
    ];
    const KEY_FIELDS = [
        'id',
        'key',
        'project',
        'type',
        'ip_allowlist',
        'write_grant_secret',
        'report_discovered_content',
        'usage_exhausted',
        'duplicate_guard',
    ];

    it.each(docs)(
        '%s declares only fields a document takes, and none the seeder refuses (config, faults, reference)',
        (_name, doc) => {
            expect(Object.keys(doc).sort()).toEqual(['keys', 'projects']);
            for (const project of doc.projects)
                for (const field of Object.keys(project)) expect(PROJECT_FIELDS, `projects.${field}`).toContain(field);
            for (const key of doc.keys)
                for (const field of Object.keys(key)) expect(KEY_FIELDS, `keys.${field}`).toContain(field);
        }
    );

    it.each(docs)(
        '%s: ids are UUIDs, tokens are {id}|{secret} with an id of 100000 or more, and a device is named',
        (_name, doc) => {
            for (const row of [...doc.projects, ...doc.keys]) expect(row.id, 'id').toMatch(UUID);
            for (const project of doc.projects) {
                const [id, secret, ...rest] = String(project.user.token).split('|');
                expect(Number(id)).toBeGreaterThanOrEqual(100000);
                expect(secret).toBeTruthy();
                expect(rest, 'a secret holds no pipe').toEqual([]);
                expect(project.user.device_id).toBeTruthy();
            }
        }
    );

    it.each(docs)(
        '%s: a key names one of the file’s projects, a translation names the base or a target locale, a block carries content',
        (_name, doc) => {
            const ids = new Set(doc.projects.map((p) => p.id));
            for (const key of doc.keys)
                if (key.project !== null) expect(ids.has(key.project), `key ${key.key}'s project`).toBe(true);
            for (const project of doc.projects) {
                const locales = new Set([project.base_locale ?? 'en-us', ...(project.target_locales ?? [])]);
                const items = [
                    ...(project.phrases ?? []),
                    ...(project.blocks ?? []).flatMap((b: any) => b.phrases ?? []),
                ];
                for (const item of items)
                    for (const locale of Object.keys(item.translations ?? {}))
                        expect(locales.has(locale), `${locale} on ${item.phrase}`).toBe(true);
                for (const b of project.blocks ?? []) expect(b.content, `block ${b.custom_id}'s content`).toBeTruthy();
            }
        }
    );

    it.each(docs)('%s: no value holds a null byte or runs past 255 characters where the column does', (_name, doc) => {
        const text = JSON.stringify(doc);
        expect(text).not.toContain('\\u0000');
        for (const project of doc.projects) {
            expect(String(project.title).length).toBeLessThanOrEqual(255);
            expect(String(project.user.device_id).length).toBeLessThanOrEqual(255);
        }
    });
});

it('ids, raw keys and user tokens are unique across the files, inside React’s ranges', () => {
    const files = Object.values(FILES);
    expect(new Set(files.map((f) => f.index)).size, 'one index per file: it places the file’s ids and addresses').toBe(
        files.length
    );
    expect(new Set(files.map((f) => f.slug)).size, 'one slug per file: it names the file’s raw keys').toBe(
        files.length
    );
    const projects = files.flatMap((f) => f.document.projects) as Array<{
        id: string;
        user: { token: string; device_id: string };
    }>;
    const keys = files.flatMap((f) => f.document.keys) as Array<{ id: string; key: string }>;
    const tokens = projects.map((p) => p.user.token);
    for (const [what, values] of [
        ['project id', projects.map((p) => p.id)],
        ['key id', keys.map((k) => k.id)],
        ['raw key', keys.map((k) => k.key)],
        ['token id', tokens.map((t) => t.split('|')[0])],
        ['token secret', tokens.map((t) => t.split('|')[1])],
        ['device id', projects.map((p) => p.user.device_id)],
    ] as const) {
        expect(new Set(values).size, `every ${what} is unique`).toBe(values.length);
    }
    for (const id of [...projects, ...keys].map((r) => r.id))
        expect(id).toMatch(/^7800[0-9a-f]{4}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    for (const { key } of keys) expect(key.startsWith('react-'), key).toBe(true);
    for (const token of tokens) {
        const id = Number(token.split('|')[0]);
        expect(id >= 130000 && id <= 139999, token).toBe(true);
    }
});

it('the playground’s world is the one example/fixture.mjs names to the forwarder: its caller address', () => {
    expect(playground.take('base').address).toBe('10.78.18.1');
});

it('a world is handed out once: each case takes a fresh one, and a pool taken dry throws, naming the count to raise', () => {
    const file = seedFile('pool-check', 18, {
        w: { projects: { p1: { target_locales: ['es-es'] } }, keys: { k: { project: 'p1', type: 'read' } }, count: 2 },
    });
    const first = file.take('w');
    const second = file.take('w');
    expect(second.project()).not.toBe(first.project());
    expect(second.key('k')).not.toBe(first.key('k'));
    expect(second.address).not.toBe(first.address);
    expect(() => file.take('w')).toThrow(/holds 2 "w" worlds.*raise its count/);
});
