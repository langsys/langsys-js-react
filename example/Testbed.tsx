import { Suspense, lazy, useEffect, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';
// The playground imports library source directly so edits hot-reload.
import {
    LangsysApp,
    LangsysAppAPI,
    setWriteGrant,
    useCurrentLocale,
    useLocaleStore,
    useT,
    useWriteEnabled,
} from '../src/index';

/**
 * E2E testbed for write-key gating & content discovery (ticket 838).
 *
 * Driven by `example/e2e/write-gating.mjs`. Everything it needs to assert is
 * either exposed as a `data-testid` or observable on the wire, so the harness
 * verifies what actually happened rather than what the code appears to do.
 *
 * Query params:
 *   ?key=read|ip_write|write   which API key to init with (default: read)
 *   ?run=<id>                  suffix making every phrase unique per run, so the
 *                              misses are genuinely new rather than already-cached
 *   ?route=a|b                 which client-side route is showing
 *
 * Phrases are built from `run`, so a fresh id guarantees a real catalog miss.
 */

const KEYS: Record<string, string | undefined> = {
    read: import.meta.env.VITE_LANGSYS_KEY_READ,
    ip_write: import.meta.env.VITE_LANGSYS_KEY_IP_WRITE,
    write: import.meta.env.VITE_LANGSYS_KEY_WRITE,
};

function params() {
    const q = new URLSearchParams(window.location.search);
    return {
        keyType: q.get('key') ?? 'read',
        run: q.get('run') ?? 'norun',
        route: q.get('route') ?? 'a',
    };
}

/**
 * A lazy child whose module is resolved on demand, so the testbed can hold the
 * boundary pending and then release it. Held pending, the child has never
 * mounted and its phrase is invisible to discovery — the same position as
 * `{open && <Modal/>}`, even though the markup doesn't look conditional.
 * Releasing it proves the phrase *would* have registered, so the pending
 * assertion isn't vacuous.
 */
// `ReactElement`, not the bare global `JSX.Element`: React 19's types drop the
// global JSX namespace, so `JSX.Element` is TS2503 here. It compiles today only
// because tsconfig excludes example/ and Vite transpiles without checking.
let releaseLazyChild!: (mod: { default: () => ReactElement }) => void;
const lazyChildModule = new Promise<{ default: () => ReactElement }>((resolve) => {
    releaseLazyChild = resolve;
});
const LazyChild = lazy(() => lazyChildModule);

export function Testbed() {
    const { keyType, run } = params();
    const [, , localeStore] = useLocaleStore('en-US');
    const [status, setStatus] = useState('initializing');
    const [grantResult, setGrantResult] = useState('none');
    // Route is state so a pushState navigation re-renders WITHOUT a reload —
    // the SDK instance and any pending hint timer have to survive it.
    const [route, setRoute] = useState(() => params().route);

    useEffect(() => {
        const onNav = () => setRoute(params().route);
        window.addEventListener('popstate', onNav);
        return () => window.removeEventListener('popstate', onNav);
    }, []);

    useEffect(() => {
        const projectid = import.meta.env.VITE_LANGSYS_PROJECT_ID;
        const baseUrl = import.meta.env.VITE_LANGSYS_BASE_URL;
        const key = KEYS[keyType];
        if (!projectid || !key) {
            setStatus(`missing config: projectid=${!!projectid} key(${keyType})=${!!key}`);
            return;
        }
        if (baseUrl) LangsysAppAPI.setBaseUrl(baseUrl);

        LangsysApp.init({
            projectid,
            key,
            UserLocaleStore: localeStore,
            baseLocale: 'en-US',
            debug: true,
        })
            .then((res) => setStatus(res?.status === false ? `init failed: ${res.errors?.join(', ')}` : 'ready'))
            .catch((e) => setStatus(`init threw: ${String(e)}`));
    }, [localeStore, keyType]);

    if (status !== 'ready') {
        return (
            <main style={s.main}>
                <p data-testid="status">{status}</p>
            </main>
        );
    }
    return <Body run={run} route={route} keyType={keyType} grantResult={grantResult} setGrantResult={setGrantResult} />;
}

function Body({
    run,
    route,
    keyType,
    grantResult,
    setGrantResult,
}: {
    run: string;
    route: string;
    keyType: string;
    grantResult: string;
    setGrantResult: (v: string) => void;
}) {
    const t = useT();
    const loadedLocale = useCurrentLocale();
    const writeEnabled = useWriteEnabled();
    const [modalOpen, setModalOpen] = useState(false);
    const [showSuspense, setShowSuspense] = useState(false);
    const [postGrantVisible, setPostGrantVisible] = useState(false);
    const [lateVisible, setLateVisible] = useState(false);

    return (
        <main style={s.main}>
            <p data-testid="status">ready</p>
            {/* Rendered verbatim: `undefined` (not yet known) must stay distinct from `false`. */}
            <p data-testid="write-enabled">{String(writeEnabled)}</p>
            <p data-testid="key-type">{keyType}</p>
            <p data-testid="run">{run}</p>
            <p data-testid="route">{route}</p>
            <p data-testid="locale">{loadedLocale}</p>
            <p data-testid="grant-result">{grantResult}</p>

            {/* --- Baseline misses: unique per run, so these are real --------------- */}
            <h1>{t(`E2E react ${run} hero`, 'UI')}</h1>
            <p>{t(`E2E react ${run} body`, 'UI')}</p>

            {/* --- Route-specific phrase. Only ever rendered on route B, so a hint
                    recorded on route A must NOT claim to have come from route B. --- */}
            {route === 'b' && <p>{t(`E2E react ${run} routeb`, 'UI')}</p>}

            {/* --- Discovery shape 1: mounted but CSS-hidden -> IS discovered ------ */}
            <div style={{ display: 'none' }} data-testid="hidden-modal">
                <p>{t(`E2E react ${run} hidden`, 'UI')}</p>
            </div>

            {/* --- Discovery shape 2: conditionally rendered -> NOT discovered
                    until it actually mounts ------------------------------------- */}
            <button data-testid="open-modal" onClick={() => setModalOpen(true)}>
                open modal
            </button>
            {modalOpen && (
                <div data-testid="conditional-modal">
                    <p>{t(`E2E react ${run} conditional`, 'UI')}</p>
                </div>
            )}

            {/* --- Discovery shape 3: pending Suspense boundary -> NOT discovered.
                    The fallback's phrase renders; the child's never does. -------- */}
            <button data-testid="show-suspense" onClick={() => setShowSuspense(true)}>
                show suspense
            </button>
            <button
                data-testid="resolve-suspense"
                onClick={() =>
                    releaseLazyChild({
                        default: function Resolved() {
                            // Same phrase the pending assertion looked for — once the
                            // boundary resolves it mounts and must register.
                            return <p data-testid="suspense-child">{t(`E2E react ${run} suspended`, 'UI')}</p>;
                        },
                    })
                }
            >
                resolve suspense
            </button>
            {showSuspense && (
                <Suspense fallback={<p>{t(`E2E react ${run} fallback`, 'UI')}</p>}>
                    <LazyChild />
                </Suspense>
            )}

            {/* --- Grant path: misses AFTER the grant lands register directly ------ */}
            <button
                data-testid="set-grant"
                onClick={async () => {
                    setGrantResult('pending');
                    try {
                        // The JWT is passed in via ?grant= so the driver can mint
                        // valid / short-lived / expired / no-exp variants itself.
                        const grant = new URLSearchParams(window.location.search).get('grant') ?? 'test-grant';
                        await setWriteGrant(grant);
                        setGrantResult('resolved');
                    } catch (e) {
                        setGrantResult(`threw: ${String(e)}`);
                    }
                }}
            >
                set write grant
            </button>
            <button
                data-testid="clear-grant"
                onClick={async () => {
                    setGrantResult('pending');
                    try {
                        await setWriteGrant(undefined);
                        setGrantResult('cleared');
                    } catch (e) {
                        setGrantResult(`threw: ${String(e)}`);
                    }
                }}
            >
                clear write grant
            </button>
            <button data-testid="render-late-phrase" onClick={() => setLateVisible(true)}>
                render late phrase
            </button>
            {lateVisible && <p>{t(`E2E react ${run} late`, 'UI')}</p>}
            <button data-testid="render-post-grant" onClick={() => setPostGrantVisible(true)}>
                render post-grant phrase
            </button>
            {postGrantVisible && <p>{t(`E2E react ${run} postgrant`, 'UI')}</p>}

            {/* --- Client-side navigation, for the jitter-window URL check --------- */}
            <button
                data-testid="nav-to-b"
                onClick={() => {
                    const u = new URL(window.location.href);
                    u.searchParams.set('route', 'b');
                    // pushState only: no reload, so the SDK instance and any pending
                    // hint timer survive the navigation — the case that breaks if the
                    // URL is read at flush time instead of at miss time.
                    window.history.pushState({}, '', u);
                    window.dispatchEvent(new PopStateEvent('popstate'));
                }}
            >
                navigate to route b
            </button>
        </main>
    );
}

const s: Record<string, CSSProperties> = {
    main: { fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' },
};
