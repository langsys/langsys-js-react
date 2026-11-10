/**
 * Starts the contract fixture's forwarder (`contract-fixture/forwarder.mjs`) for the playground and
 * `example-next/`, and names the playground's case to it. See TESTING.md.
 *
 * The forwarder passes every `/api` route to a real Langsys API: an SDK test clone, seeded from
 * `_dev_/contract/seeds/playground.json` (among the other seed files), or a developer's own API
 * holding that project. It holds no state of its own.
 *
 *   LANGSYS_CONTRACT_TARGET=https://api.langsys5.test \
 *   LANGSYS_CONTRACT_CLONE_ROOT=~/Documents/dev/langsys5 \
 *   NODE_EXTRA_CA_CERTS=~/.config/valet/CA/LaravelValetCASelfSigned.pem \
 *   npm run fixture                 # port 8787
 *   npm run fixture -- --port 9000
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { root, world } from './playground-world.mjs';

const target = process.env.LANGSYS_CONTRACT_TARGET;
const cloneRoot = process.env.LANGSYS_CONTRACT_CLONE_ROOT;
if (!target || !cloneRoot) {
    console.error(
        "The playground reaches a real Langsys API through the contract forwarder. Set LANGSYS_CONTRACT_TARGET to the API's origin,\n" +
            'LANGSYS_CONTRACT_CLONE_ROOT to its langsys checkout (the forwarder reads accepted hints from it) and, for a local\n' +
            'HTTPS certificate, NODE_EXTRA_CA_CERTS. See TESTING.md, "Start the forwarder".'
    );
    process.exit(2);
}
const portArg = process.argv.indexOf('--port');
const port = portArg > -1 ? process.argv[portArg + 1] : '8787';
const log = process.env.LANGSYS_CONTRACT_LOG;

const child = spawn(
    process.execPath,
    [
        join(root, 'contract-fixture', 'forwarder.mjs'),
        '--target',
        target,
        '--clone-root',
        cloneRoot,
        '--port',
        port,
        ...(log ? ['--log', log] : []),
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] }
);
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
    // The playground's case: its project, keys and seeded user, and the address it calls from.
    const res = await fetch(`${fixture_url}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            keys: Object.values(world.keys),
            projects: [world.projectId],
            tokens: [world.token],
            caller: world.caller,
            faults: [],
            reference: null,
        }),
    });
    if (!res.ok) {
        console.error(`Naming the playground's case failed: ${res.status} ${await res.text()}`);
        child.kill();
        return;
    }
    console.log(
        `Contract forwarder ready.\n  API:   ${base_url}\n  Hints: ${fixture_url}/state?project=${world.projectId}\n  Project ${world.projectId} (en → es-es), keys ${world.keys.writer} (write) and ${world.keys.public} (read-only, reports pages).`
    );
});
