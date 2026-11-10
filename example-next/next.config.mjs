import { fileURLToPath } from 'node:url';
import { withLangsys } from 'langsys-js-react/next';
import { world } from '../example/playground-world.mjs';

// The contract fixture's forwarder started by `npm run fixture` in the repo root (see ../TESTING.md).
const fixture = process.env.LANGSYS_FIXTURE_URL ?? 'http://127.0.0.1:8787';
const here = fileURLToPath(new URL('.', import.meta.url));

// withLangsys adds the placeholder transform to Turbopack and webpack; Next's own compiler stays on.
export default withLangsys({
    agentRules: false,
    // The playground's project and keys, from `_dev_/contract/seeds/playground.json`.
    env: { LANGSYS_PLAYGROUND_PROJECT: world.projectId, LANGSYS_PLAYGROUND_WRITER: world.keys.writer, LANGSYS_PLAYGROUND_PUBLIC: world.keys.public },
    outputFileTracingRoot: here,
    turbopack: { root: here },
    async redirects() {
        return [{ source: '/', destination: '/en', permanent: false }];
    },
    async rewrites() {
        return [
            { source: '/lsapi/:path*', destination: `${fixture}/api/:path*` },
            { source: '/lsfixture/:path*', destination: `${fixture}/__fixture/:path*` },
        ];
    },
});
