/**
 * E2E driver for write-key gating & content discovery (ticket 838).
 *
 *   node example/e2e/write-gating.mjs [--base http://127.0.0.1:5174]
 *
 * Drives `example/Testbed.tsx` in a real browser and asserts on what actually
 * crossed the wire — every request to the API is captured with its payload, so
 * "did it register?" is answered by the POST body, not by reading the SDK.
 *
 * Requires the Vite playground running (`npm run dev`) and the local API from
 * `.env` reachable.
 */
import { chromium, request } from 'playwright';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Local dev signing secret for write grants. Local-only — the real one is a
 * server secret and never ships to a client.
 */
const GRANT_SECRET = process.env.LANGSYS_WRITE_GRANT_SECRET ?? '';

const b64url = (v) => Buffer.from(v).toString('base64url');

/**
 * Mint an HS256 write grant. Minting rather than using fixed sample tokens is
 * what makes the expiry test possible — a checked-in token is either always
 * valid or always expired, never expiring mid-run.
 */
function mintGrant({ sub = 'e2e-react', expiresInSec = 300, omitExp = false } = {}) {
    const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'HS256' }));
    const claims = omitExp ? { sub } : { sub, exp: Math.floor(Date.now() / 1000) + expiresInSec };
    const payload = b64url(JSON.stringify(claims));
    const data = `${header}.${payload}`;
    const sig = crypto.createHmac('sha256', GRANT_SECRET).update(data).digest('base64url');
    return `${data}.${sig}`;
}

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 ? process.argv[i + 1] : fallback;
};

// NOTE: use `localhost`, not `127.0.0.1` — the API's CORS allow-list is keyed on
// the literal origin string and only answers `localhost`. A 127.0.0.1 origin gets
// a 204 preflight with no Access-Control-Allow-Origin and every call fails.
const BASE = arg('base', 'http://localhost:5174');
/**
 * API host the testbed talks to. Must track whatever `VITE_LANGSYS_BASE_URL`
 * points the page at — the request-capture filter keys on it, and if the two
 * disagree the harness records zero traffic: positive checks fail for the wrong
 * reason and negative checks ("registers nothing") pass vacuously.
 */
function envFileValue(key) {
    // Vite loads .env for the browser; node does not. Without reading it here the
    // driver would fall back to the default while the testbed used the .env value,
    // which is precisely the divergence this filter must not have.
    for (const file of ['.env.local', '.env']) {
        let text;
        try {
            text = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
        } catch {
            continue;
        }
        const line = text
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.startsWith(`${key}=`));
        if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
    }
    return undefined;
}

// Precedence: explicit --api, then the shell, then .env, then the default.
const API_BASE = arg('api', process.env.VITE_LANGSYS_BASE_URL ?? envFileValue('VITE_LANGSYS_BASE_URL') ?? 'http://langsys2.test/api');
const API_HOST = new URL(API_BASE).host;

// Same source the testbed reads, so the driver and the page can never disagree
// about which project/keys are under test.
const envOr = (k) => process.env[k] ?? envFileValue(k);
const KEYS = {
    read: envOr('VITE_LANGSYS_KEY_READ'),
    ip_write: envOr('VITE_LANGSYS_KEY_IP_WRITE'),
    write: envOr('VITE_LANGSYS_KEY_WRITE'),
};
const AUTHORIZE_URL = `${API_BASE.replace(/\/$/, '')}/authorize-project/${envOr('VITE_LANGSYS_PROJECT_ID')}`;
// The jitter window is 5–30s (HINT_MIN_DELAY_MS / HINT_MAX_DELAY_MS in the core),
// so a hint assertion has to be willing to wait past the maximum.
const HINT_MAX_WAIT_MS = 35_000;

const results = [];
function check(name, pass, detail = '') {
    results.push({ name, pass, detail });
    console.log(`${pass ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/** Fresh id per run so every phrase is a genuine catalog miss. */
function runId() {
    return Math.random().toString(36).slice(2, 10);
}

/**
 * Opens the testbed and records every API request. Returns helpers for
 * inspecting what was sent.
 */
async function openTestbed(browser, { keyType, run, extraParams = '' }) {
    const context = await browser.newContext();
    const page = await context.newPage();

    const api = [];
    const byRequest = new Map();
    page.on('request', (req) => {
        const url = req.url();
        if (!url.includes(API_HOST)) return;
        let body;
        try {
            body = req.postData();
        } catch {
            body = undefined;
        }
        // `status` stays null until the response lands. Asserting only on what was
        // SENT is not enough: a server that rejects every registration still
        // produces perfect-looking request payloads, and the suite would pass
        // while nothing was actually registered.
        const entry = { method: req.method(), url, body, headers: req.headers(), status: null, error: null };
        byRequest.set(req, entry);
        api.push(entry);
    });
    page.on('response', (res) => {
        const entry = byRequest.get(res.request());
        if (entry) entry.status = res.status();
    });
    page.on('requestfailed', (req) => {
        const entry = byRequest.get(req);
        if (entry) entry.error = req.failure()?.errorText ?? 'failed';
    });

    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    await page.goto(`${BASE}/?testbed=1&key=${keyType}&run=${run}${extraParams}`);
    // The status node exists while still initializing — wait for it to settle,
    // otherwise every downstream assertion races the init round-trip.
    await page
        .waitForFunction(
            () => document.querySelector('[data-testid="status"]')?.textContent !== 'initializing',
            { timeout: 20_000 },
        )
        .catch(() => {});

    return {
        page,
        context,
        api,
        consoleErrors,
        status: () => page.textContent('[data-testid="status"]'),
        writeEnabled: () => page.textContent('[data-testid="write-enabled"]'),
        registrations: () => api.filter((r) => r.url.includes('translatable-items')),
        hints: () => api.filter((r) => r.url.includes('discovery/hint')),
        /**
         * Phrases the server ACCEPTED. Deliberately filtered on a 2xx response
         * rather than on the request having been sent — "registered" means the
         * server took it, not that we asked.
         */
        registeredPhrases: () =>
            api
                .filter((r) => r.url.includes('translatable-items') && r.body && r.status >= 200 && r.status < 300)
                .flatMap((r) => {
                    try {
                        return (JSON.parse(r.body).translatable_items ?? []).map((i) => i.phrase);
                    } catch {
                        return [];
                    }
                }),
        /** Registration attempts that did NOT come back 2xx. */
        failedRegistrations: () =>
            api.filter((r) => r.url.includes('translatable-items') && (r.error || (r.status !== null && (r.status < 200 || r.status >= 300)))),
        /** Returns as soon as at least one hint has been sent. */
        waitForHint: async () => {
            const deadline = Date.now() + HINT_MAX_WAIT_MS;
            while (Date.now() < deadline) {
                const h = api.filter((r) => r.url.includes('discovery/hint'));
                if (h.length) return h;
                await page.waitForTimeout(500);
            }
            return [];
        },
        /**
         * Waits out the WHOLE jitter window and returns every hint. Each URL gets
         * its own independent 5–30s timer, so returning on the first hint can miss
         * a sibling that simply drew a longer delay.
         */
        collectAllHints: async () => {
            await page.waitForTimeout(HINT_MAX_WAIT_MS);
            return api.filter((r) => r.url.includes('discovery/hint'));
        },
        waitForRegistrationOf: async (needle, timeoutMs = 15_000) => {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                const found = api
                    .filter((r) => r.url.includes('translatable-items') && r.body && r.status >= 200 && r.status < 300)
                    .some((r) => r.body.includes(needle));
                if (found) return true;
                await page.waitForTimeout(400);
            }
            return false;
        },
    };
}

async function main() {
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    console.log(`\nTestbed: ${BASE}\n`);

    // ---------------------------------------------------------------- read lane
    {
        const run = runId();
        console.log(`[read key] run=${run}`);
        const tb = await openTestbed(browser, { keyType: 'read', run });

        check('read: init succeeds', (await tb.status()) === 'ready', await tb.status());
        check(
            'read: useWriteEnabled reports false (not undefined)',
            (await tb.writeEnabled()) === 'false',
            `got ${await tb.writeEnabled()}`,
        );
        // Collect over the WHOLE jitter window before asserting either of these.
        // Checking "registers nothing" the instant init settles would pass even in
        // the regression it names, because no flush could have fired yet; and a
        // duplicate hint drawing a longer delay would escape the exactly-one
        // assertion entirely. Both only mean something once the window has closed.
        const hints = await tb.collectAllHints();
        check('read: registers nothing', tb.registrations().length === 0, `${tb.registrations().length} POSTs`);
        check('read: sends exactly one discovery hint', hints.length === 1, `${hints.length} hints`);
        if (hints.length) {
            const payload = JSON.parse(hints[0].body ?? '{}');
            check('read: hint carries page_url only (no phrase content)', 'page_url' in payload && Object.keys(payload).length === 1, JSON.stringify(payload));
            check('read: hint reports the testbed URL', String(payload.page_url).includes('testbed=1'), String(payload.page_url));
        }
        check('read: no page errors', tb.consoleErrors.length === 0, tb.consoleErrors.join('; '));
        await tb.context.close();
    }

    // --------------------------------------------------------------- write lane
    {
        const run = runId();
        console.log(`\n[write key] run=${run}`);
        const tb = await openTestbed(browser, { keyType: 'write', run });

        check('write: init succeeds', (await tb.status()) === 'ready', await tb.status());
        check('write: useWriteEnabled reports true', (await tb.writeEnabled()) === 'true', `got ${await tb.writeEnabled()}`);

        const gotHero = await tb.waitForRegistrationOf(`E2E react ${run} hero`);
        check('write: registers rendered phrases directly', gotHero);
        // Guards the blind spot: without this the suite passes while the server
        // rejects every registration, because the request payloads look perfect.
        const failed = tb.failedRegistrations();
        check(
            'write: the server ACCEPTED the registrations',
            failed.length === 0,
            failed.length ? `${failed.length} non-2xx: ${[...new Set(failed.map((f) => f.error ?? f.status))].join(', ')}` : '',
        );

        const phrases = tb.registeredPhrases();
        // --- the three discovery shapes ---
        check(
            'shape: mounted-but-CSS-hidden IS discovered',
            phrases.some((p) => p.includes(`${run} hidden`)),
            'display:none content still executes t() and is walked',
        );
        check(
            'shape: conditionally-rendered is NOT discovered before mount',
            !phrases.some((p) => p.includes(`${run} conditional`)),
            'never mounted, so never seen',
        );

        // Mount the conditional modal; it must register only now.
        await tb.page.click('[data-testid="open-modal"]');
        const conditionalAfter = await tb.waitForRegistrationOf(`E2E react ${run} conditional`);
        check('shape: conditionally-rendered IS discovered once mounted', conditionalAfter);

        // Let the conditional-modal registration settle first. Without this the
        // next miss lands while that POST is still in flight and is silently
        // dropped — see the [flush race] section, which tests that on purpose.
        await tb.page.waitForTimeout(5000);

        // Pending Suspense boundary: fallback renders, child does not.
        await tb.page.click('[data-testid="show-suspense"]');
        // Full default window: registration batches on a 3s interval, and by this
        // point in the run several batches are queued ahead of this one.
        const fallbackSeen = await tb.waitForRegistrationOf(`E2E react ${run} fallback`);
        check('shape: Suspense fallback IS discovered', fallbackSeen);
        check(
            'shape: pending Suspense child is NOT discovered',
            !tb.registeredPhrases().some((p) => p.includes(`${run} suspended`)),
            'boundary still pending, child never mounted',
        );

        // Release the boundary — the same phrase must now register, which is what
        // makes the assertion above meaningful rather than vacuous.
        await tb.page.click('[data-testid="resolve-suspense"]');
        await tb.page.waitForSelector('[data-testid="suspense-child"]');
        check(
            'shape: released Suspense child IS discovered',
            await tb.waitForRegistrationOf(`E2E react ${run} suspended`),
        );

        check('write: no page errors', tb.consoleErrors.length === 0, tb.consoleErrors.join('; '));
        await tb.context.close();
    }

    // ------------------------------------------------------------- grant lane
    // Deliberately driven with the READ key: a read key WITH a valid grant is
    // write-enabled and the same key without one is not, so this proves the
    // grant arm rather than the key type.
    if (!GRANT_SECRET) {
        console.log('\n[grant] SKIPPED — set LANGSYS_WRITE_GRANT_SECRET to run this lane');
        check('grant: lane executed', false, 'no signing secret in env');
    } else {
        const applyGrant = async (tb) => {
            const before = tb.api.filter((r) => r.url.includes('authorize-project')).length;
            await tb.page.click('[data-testid="set-grant"]');
            await tb.page.waitForFunction(
                () => {
                    const v = document.querySelector('[data-testid="grant-result"]')?.textContent;
                    return v !== 'none' && v !== 'pending';
                },
                { timeout: 20_000 },
            );
            return before;
        };

        {
            const run = runId();
            console.log(`\n[grant: valid] run=${run}`);
            const tb = await openTestbed(browser, {
                keyType: 'read',
                run,
                extraParams: `&grant=${mintGrant({ expiresInSec: 900 })}`,
            });

            check('grant: read key starts read-only', (await tb.writeEnabled()) === 'false', await tb.writeEnabled());
            const authBefore = await applyGrant(tb);

            const authCalls = tb.api.filter((r) => r.url.includes('authorize-project'));
            check('grant: setWriteGrant re-authorizes', authCalls.length > authBefore, `${authBefore} -> ${authCalls.length}`);
            check(
                'grant: the re-auth carries X-Write-Grant',
                authCalls.some((r) => Object.keys(r.headers).some((h) => h.toLowerCase() === 'x-write-grant')),
            );
            check('grant: valid grant flips a READ key to write-enabled', (await tb.writeEnabled()) === 'true', await tb.writeEnabled());

            // The behaviour that matters: a miss occurring AFTER the grant registers.
            await tb.page.click('[data-testid="render-late-phrase"]');
            check(
                'grant: a miss after the grant registers directly',
                await tb.waitForRegistrationOf(`E2E react ${run} late`),
            );

            // Clearing returns the session to read-only.
            await tb.page.click('[data-testid="clear-grant"]');
            await tb.page.waitForFunction(
                () => document.querySelector('[data-testid="grant-result"]')?.textContent === 'cleared',
                { timeout: 20_000 },
            );
            check('grant: clearing returns the session to read-only', (await tb.writeEnabled()) === 'false', await tb.writeEnabled());
            await tb.context.close();
        }

        for (const [label, grant] of [
            ['expired', mintGrant({ expiresInSec: -600 })],
            ['no exp claim', mintGrant({ omitExp: true })],
        ]) {
            const run = runId();
            console.log(`\n[grant: ${label}] run=${run}`);
            const tb = await openTestbed(browser, { keyType: 'read', run, extraParams: `&grant=${grant}` });
            await applyGrant(tb);
            check(`grant: ${label} grant leaves the session read-only`, (await tb.writeEnabled()) === 'false', await tb.writeEnabled());
            await tb.context.close();
        }

        // Expiry mid-session — the case that justifies the callback form of
        // `writeGrant` over a static string. A short token is accepted now and
        // must stop working once it lapses, WITHOUT the app re-initializing.
        {
            const run = runId();
            const ttl = 60;
            console.log(`\n[grant: expires mid-session, ttl=${ttl}s] run=${run}`);
            const tb = await openTestbed(browser, { keyType: 'read', run });
            // Mint AFTER init, not before page load. Minting up front makes the
            // token's remaining life depend on how long navigation and init took,
            // which on a loaded API can be most of a 60s budget — the lane would
            // then fail for latency reasons while claiming the grant was refused.
            // The point under test is "a token that is fresh AT APPLY TIME is
            // accepted", so mint it as late as possible and inject it into the URL
            // the click handler reads.
            await tb.page.evaluate((g) => {
                const u = new URL(window.location.href);
                u.searchParams.set('grant', g);
                window.history.replaceState({}, '', u);
            }, mintGrant({ expiresInSec: ttl }));
            await applyGrant(tb);
            check('expiry: short-lived grant is accepted while fresh', (await tb.writeEnabled()) === 'true', await tb.writeEnabled());

            // Wait past expiry + the server's 60s clock skew leeway, then re-auth
            // with the SAME now-stale token, exactly as a static string would.
            await tb.page.waitForTimeout((ttl + 65) * 1000);
            await applyGrant(tb);
            check(
                'expiry: the same token no longer authorizes once lapsed',
                (await tb.writeEnabled()) === 'false',
                `${await tb.writeEnabled()} — a static writeGrant string dies here; a provider callback re-mints`,
            );
            await tb.context.close();
        }
    }

    // ------------------------------------------- ip_write: loopback vs forwarded
    {
        const run = runId();
        console.log(`\n[ip_write key, loopback] run=${run}`);
        const tb = await openTestbed(browser, { keyType: 'ip_write', run });
        check('ip_write@loopback: write-enabled true', (await tb.writeEnabled()) === 'true', `got ${await tb.writeEnabled()}`);
        check('ip_write@loopback: registers directly', await tb.waitForRegistrationOf(`E2E react ${run} hero`));
        await tb.context.close();
    }
    {
        const run = runId();
        console.log(`\n[ip_write key, forwarded IP]`);
        // Asserted at the API level, NOT through a browser page — deliberately.
        //
        // Chromium strips `X-Forwarded-For` from page-initiated requests, so the
        // browser cannot forge it: driving this lane through the page produced
        // write_enabled=true (the server correctly seeing loopback) while the
        // header appeared present in Playwright's own request record. It used to
        // pass only because CORS did not yet allow `x-forwarded-for`, so the
        // request was blocked outright and the lane never reached the server —
        // a check that passed for the wrong reason.
        //
        // That Chromium refuses to send it is the correct security behaviour, so
        // the right move is to prove the server's IP gate where the header can
        // actually be set, and to record that a page can never spoof it.
        const rc = await request.newContext({
            extraHTTPHeaders: { 'x-Authorization': KEYS.ip_write, 'X-Forwarded-For': '203.0.113.99' },
        });
        const forwarded = await (await rc.get(AUTHORIZE_URL)).json().catch(() => ({}));
        check(
            'ip_write@forwarded: server reports write-enabled false',
            forwarded?.data?.write_enabled === false,
            `got ${forwarded?.data?.write_enabled} — same key, different IP; only the server can decide this`,
        );
        await rc.dispose();

        const loopback = await request.newContext({ extraHTTPHeaders: { 'x-Authorization': KEYS.ip_write } });
        const direct = await (await loopback.get(AUTHORIZE_URL)).json().catch(() => ({}));
        check(
            'ip_write@loopback: server reports write-enabled true (negative control)',
            direct?.data?.write_enabled === true,
            `got ${direct?.data?.write_enabled}`,
        );
        await loopback.dispose();

        // And the security property itself: a browser page cannot forge the header.
        const ctx = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': '203.0.113.99' } });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/?testbed=1&key=ip_write&run=${run}`);
        await page.waitForSelector('[data-testid="write-enabled"]');
        await page.waitForTimeout(2000);
        check(
            'ip_write: a browser page cannot spoof X-Forwarded-For',
            (await page.textContent('[data-testid="write-enabled"]')) === 'true',
            'Chromium strips the header, so the server still sees the real client IP',
        );
        await ctx.close();
    }

    // --------------------------------------------- URL captured at miss time
    {
        const run = runId();
        console.log(`\n[jitter-window navigation] run=${run}`);
        const tb = await openTestbed(browser, { keyType: 'read', run });
        // Navigate client-side well inside the 5–30s window. If the hint read
        // location.href at flush time it would report route=b.
        await tb.page.waitForTimeout(1000);
        await tb.page.click('[data-testid="nav-to-b"]');
        await tb.page.waitForFunction(
            () => document.querySelector('[data-testid="route"]')?.textContent === 'b',
        );
        const hints = await tb.collectAllHints();
        check('jitter: a hint was sent', hints.length > 0);
        // Route B renders an extra phrase, so a hint FOR route B is also correct —
        // asserting on hints[0] would just race the two. What proves capture at
        // miss time is that the route-A miss is reported against the route-A URL:
        // if the URL were read at flush time it would have been rewritten to
        // route=b and no hint would carry route A at all.
        const urls = hints.map((h) => String(JSON.parse(h.body ?? '{}').page_url ?? ''));
        check(
            'jitter: the route-A miss is reported against the route-A URL',
            urls.some((u) => !u.includes('route=b')),
            urls.join(' , ') || '(no hints)',
        );
        await tb.context.close();
    }

    // ------------------------------------------------- flush race (core defect)
    // A miss recorded while a registration POST is in flight is dropped: on
    // success `updateTokens()` marks every token then in the array as present in
    // the local catalog and does `this.missingTokens = []`, wiping entries added
    // during the await. Because they are now "present", nothing ever retries them.
    {
        const run = runId();
        console.log(`\n[flush race] run=${run}`);
        const tb = await openTestbed(browser, { keyType: 'write', run });
        await tb.page.waitForTimeout(5000); // initial batch clears cleanly

        // Hold the next POST for 5s. The 3s retry re-sends at ~3s, so a miss
        // recorded at ~4s lands after the last send but before the response.
        await tb.page.route('**/translatable-items', async (route) => {
            await new Promise((r) => setTimeout(r, 5000));
            await route.continue();
        });
        await tb.page.click('[data-testid="open-modal"]');
        await tb.page.waitForTimeout(4000);
        await tb.page.click('[data-testid="show-suspense"]');
        await tb.page.waitForTimeout(20_000);
        await tb.page.unroute('**/translatable-items');
        await tb.page.waitForTimeout(6000);

        const rendered = (await tb.page.textContent('body')) ?? '';
        check('race: the phrase really did render (so a miss was recorded)', rendered.includes(`${run} fallback`));
        const phrases = tb.registeredPhrases();
        check(
            'race: a miss recorded during an in-flight POST is NOT dropped',
            phrases.some((p) => p.includes(`${run} fallback`)),
            'regression guard — updateTokens() must clear only the batch it sent',
        );
        check(
            'race: the in-flight batch is not sent twice',
            phrases.filter((p) => p.includes(`${run} conditional`)).length === 1,
            `${phrases.filter((p) => p.includes(`${run} conditional`)).length} sends — the 3s interval must not overlap an in-flight POST`,
        );
        await tb.context.close();
    }

    await browser.close();

    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    if (failed.length) {
        console.log('\nFailures:');
        for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
        process.exitCode = 1;
    }
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
