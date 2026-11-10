/**
 * The playground's project, keys and caller address, read from the seed file the clone is seeded
 * with (`_dev_/contract/seeds/playground.json`, declared in `src/test-helpers/contract-seeds/playground.ts`).
 * `fixture.mjs`, `vite.config.ts` and `example-next/next.config.mjs` take their ids from here.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(readFileSync(join(root, '_dev_', 'contract', 'seeds', 'playground.json'), 'utf8'));
const project = seed.projects[0];
const key = (role) => seed.keys.find((k) => k.key.endsWith(`-${role}`)).key;

export const world = {
    projectId: project.id,
    token: project.user.token,
    keys: { writer: key('k-writer'), public: key('k-public') },
    /** The address the forwarder sends the playground's requests from: the first instance of file 9's world (src/seed-files.test.ts pins it). */
    caller: '10.78.18.1',
};
