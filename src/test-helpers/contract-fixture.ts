import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

/**
 * Starts the shared contract double (`contract-fixture/server.mjs`, vendored byte-exact from
 * langsys-js-typescript, tree 542f57f5ffcb9038db1b7411152b7e31b96cb269) in its own process.
 *
 * There is deliberately no accessor for what the double received: `state()` returns only
 * accepted state, so a test asserts on what the server accepted (CONF-1), never on what the
 * SDK sent.
 */
export interface AcceptedState {
    projects: Record<
        string,
        {
            phrases: Array<{ category: string | null; phrase: string }>;
            blocks: Array<{ category: string | null; custom_id: string; phrases: Array<{ phrase: string }> }>;
        }
    >;
    hints: Array<{ project_id: string; url: string }>;
}

export interface ContractFixture {
    baseUrl: string;
    seed(doc: unknown): Promise<void>;
    state(): Promise<AcceptedState>;
    stop(): Promise<void>;
}

export async function startContractFixture(): Promise<ContractFixture> {
    const child: ChildProcess = spawn(process.execPath, [join(process.cwd(), 'contract-fixture', 'server.mjs')], {
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    const ready = await new Promise<{ base_url: string; fixture_url: string }>((resolve, reject) => {
        let buffered = '';
        const timer = setTimeout(() => reject(new Error('contract fixture did not report ready within 10s')), 10_000);
        child.stdout!.on('data', (chunk: Buffer) => {
            buffered += chunk.toString('utf8');
            const newline = buffered.indexOf('\n');
            if (newline < 0) return;
            clearTimeout(timer);
            resolve(JSON.parse(buffered.slice(0, newline)));
        });
        child.once('exit', (code) => reject(new Error(`contract fixture exited early with code ${code}`)));
    });
    return {
        baseUrl: ready.base_url,
        seed: async (doc) => {
            const res = await fetch(ready.fixture_url + '/seed', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(doc),
            });
            if (!res.ok) throw new Error(`fixture seed answered ${res.status}`);
        },
        state: async () => (await (await fetch(ready.fixture_url + '/state')).json()) as AcceptedState,
        stop: () =>
            new Promise<void>((resolve) => {
                if (child.exitCode !== null) return resolve();
                child.once('exit', () => resolve());
                child.kill('SIGTERM');
            }),
    };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function until(check: () => boolean | Promise<boolean>, timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await check()) return;
        await sleep(25);
    }
    throw new Error(`condition not met within ${timeoutMs}ms`);
}
