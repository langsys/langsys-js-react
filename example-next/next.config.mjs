import { fileURLToPath } from 'node:url';
import { withLangsys } from 'langsys-js-react/next';

// The contract double started by `npm run fixture` in the repo root (see ../TESTING.md).
const fixture = process.env.LANGSYS_FIXTURE_URL ?? 'http://127.0.0.1:8787';
const here = fileURLToPath(new URL('.', import.meta.url));

// withLangsys adds the placeholder transform to Turbopack and webpack; Next's own compiler stays on.
export default withLangsys({
    agentRules: false,
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
