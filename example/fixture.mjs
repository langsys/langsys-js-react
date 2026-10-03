/**
 * Starts the contract double (`contract-fixture/server.mjs`) on a fixed port and seeds it with
 * `example/fixture-seed.json`, for the playground and `example-next/`. See TESTING.md.
 *
 *   npm run fixture                 # port 8787
 *   npm run fixture -- --port 9000
 *
 * Restarting it starts from the seed again: the double keeps its state in memory only.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const portArg = process.argv.indexOf('--port');
const port = portArg > -1 ? process.argv[portArg + 1] : '8787';

const child = spawn(process.execPath, [join(root, 'contract-fixture', 'server.mjs'), '--port', port], {
    stdio: ['ignore', 'pipe', 'inherit'],
});
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
child.on('exit', (code) => process.exit(code ?? 0));

let buffered = '';
child.stdout.on('data', async function onData(chunk) {
    buffered += chunk.toString('utf8');
    const newline = buffered.indexOf('\n');
    if (newline < 0) return;
    child.stdout.off('data', onData);
    child.stdout.pipe(process.stdout);
    const { base_url, fixture_url } = JSON.parse(buffered.slice(0, newline));
    const seed = readFileSync(join(root, 'example', 'fixture-seed.json'), 'utf8');
    const res = await fetch(`${fixture_url}/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: seed,
    });
    if (!res.ok) {
        console.error(`Seeding failed: ${res.status} ${await res.text()}`);
        child.kill();
        return;
    }
    console.log(
        `Contract double ready.\n  API:   ${base_url}\n  State: ${fixture_url}/state\n  Seeded project p1 (en → es-es), keys k-writer (write) and k-public (read-only, reports pages).`
    );
});
