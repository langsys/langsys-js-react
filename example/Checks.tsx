import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode, RefObject } from 'react';
// Imported by package name, as an app does, so the placeholder transform rewrites this file
// (vite.config.ts aliases the name to ../src).
import {
    LangsysApp,
    Translate,
    localeHeaders,
    useCurrentLocale,
    useLocaleStore,
    useT,
    useWriteEnabled,
} from 'langsys-js-react';

/**
 * One visible check per feature, against the contract double (`npm run fixture`). Open
 * `/?checks=1` (write key) or `/?checks=1&key=public` (read-only key that reports pages).
 * The "Accepted by the double" panel reads the double's accepted state every second, so each
 * check shows what the server actually stored, not what the SDK says it sent. See TESTING.md.
 */

const KEYS: Record<string, string> = { writer: 'k-writer', public: 'k-public' };

interface AcceptedState {
    projects: Record<
        string,
        {
            phrases: Array<{ category: string | null; phrase: string }>;
            blocks: Array<{ category: string | null; custom_id: string; phrases: Array<{ phrase: string }> }>;
        }
    >;
    hints: Array<{ project_id: string; url: string }>;
}

export function Checks() {
    const keyName = new URLSearchParams(window.location.search).get('key') ?? 'writer';
    const [locale, setLocale, localeStore] = useLocaleStore('en');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        LangsysApp.init({
            projectid: 'p1',
            key: KEYS[keyName] ?? keyName,
            UserLocaleStore: localeStore,
            baseLocale: 'en',
            apiUrl: `${window.location.origin}/lsapi`,
            debug: true,
        }).then((res) => {
            if (res?.status === false) setError(res.errors?.join(', ') ?? 'init failed');
        });
    }, [keyName, localeStore]);

    if (error) return <main style={styles.main}>Init failed: {error}. Is the double running (npm run fixture)?</main>;
    return (
        <main style={styles.main}>
            <Header keyName={keyName} locale={locale} setLocale={setLocale} />
            <BlockIds />
            <Placeholders />
            <SettleWindow />
            <LocaleHeader />
            <Accepted />
        </main>
    );
}

function Header({ keyName, locale, setLocale }: { keyName: string; locale: string; setLocale: (l: string) => void }) {
    const t = useT();
    const writeEnabled = useWriteEnabled();
    const loaded = useCurrentLocale();
    return (
        <section style={styles.card}>
            <h1 data-check="title">{t('Feature checks', 'Checks')}</h1>
            <p>
                Key <code>{keyName}</code> · write_enabled{' '}
                <code data-check="write-enabled">{String(writeEnabled)}</code> · loaded locale{' '}
                <code data-check="loaded-locale">{loaded}</code>
            </p>
            <label>
                Locale{' '}
                <select value={locale} onChange={(e) => setLocale(e.target.value)} data-check="locale">
                    <option value="en">en</option>
                    <option value="es-es">es-es</option>
                </select>
            </label>
            <p style={styles.expect}>
                Expect: switching to es-es turns the title into “Comprobaciones”. With <code>?key=public</code>,
                write_enabled is false, nothing new is registered, and the page’s URL appears under Hints 5–30 s after
                load.
            </p>
        </section>
    );
}

/** Blocks and their ids: an explicit custom_id, and one derived from the content. */
function BlockIds() {
    const ref = useRef<HTMLDivElement>(null);
    const ids = useDomIds(ref);
    return (
        <section style={styles.card}>
            <h2>Translate blocks and ids</h2>
            <div ref={ref}>
                <Translate custom_id="checks-explicit" category="Checks">
                    <p>A block with an explicit id.</p>
                    <p>Its second paragraph.</p>
                </Translate>
                <Translate category="Checks">
                    <p>
                        A block whose id is derived from its <strong>content</strong>.
                    </p>
                </Translate>
            </div>
            <p>
                Ids on the elements: <code data-check="block-ids">{ids.join(', ') || '…'}</code>
            </p>
            <p style={styles.expect}>
                Expect: <code>checks-explicit</code> and a derived id; under Accepted, a block for each id, once each.
            </p>
        </section>
    );
}

/** Interpolated values become named placeholders at build time (the Vite plugin). */
function Placeholders() {
    const t = useT();
    const [user, setUser] = useState({ firstName: 'Ana' });
    const [count, setCount] = useState(3);
    return (
        <section style={styles.card}>
            <h2>Placeholders through the transform</h2>
            <Translate category="Checks">
                <p data-check="welcome">Welcome back, {user.firstName}.</p>
            </Translate>
            <p data-check="cart">{t(`You have ${count} items in your cart`, 'Checks')}</p>
            <button onClick={() => setUser((u) => ({ firstName: u.firstName === 'Ana' ? 'Ben' : 'Ana' }))}>
                Switch user
            </button>{' '}
            <button onClick={() => setCount((n) => n + 1)}>Add item</button>
            <p style={styles.expect}>
                Expect: the double stores <code>Welcome back, {'{first_name}'}.</code> and{' '}
                <code>You have {'{count}'} items in your cart</code> once each, never a name or a number, however often
                you switch or add. In es-es the cart line reads “Tienes 3 artículos en tu carrito”.
            </p>
        </section>
    );
}

/** A lazy child behind a Suspense placeholder; the block registers only what it settles on. */
function SettleWindow() {
    const [mounted, setMounted] = useState<string[]>([]);
    const mount = (name: string) => setMounted((m) => (m.includes(name) ? m : [...m, name]));
    return (
        <section style={styles.card}>
            <h2>Suspense settle window</h2>
            <button onClick={() => mount('fast')}>Mount: resolves in 100 ms</button>{' '}
            <button onClick={() => mount('slow')}>Mount: resolves in 2 s</button>{' '}
            <button onClick={() => mount('never')}>Mount: never resolves</button>
            {mounted.includes('fast') && <FastBlock />}
            {mounted.includes('slow') && <SlowBlock />}
            {mounted.includes('never') && <NeverBlock />}
            <p style={styles.expect}>
                Expect, under Accepted: <b>never</b> stores a block with “Loading placeholder never” once 250 ms pass;{' '}
                <b>slow</b> stores the placeholder block and then the settled one, and the console shows one debug
                notice that the block changed after it settled, naming both ids; <b>fast</b> should store only the
                settled block (see TESTING.md for how React’s Suspense timing affects it).
            </p>
        </section>
    );
}

// The blocks' text is literal, not interpolated, so the transform leaves it as it is.
function FastBlock() {
    const Late = useLate(100, () => <p>Settled content fast</p>);
    return (
        <Translate category="Checks">
            <p>Fast block intro</p>
            <Suspense fallback={<p>Loading placeholder fast</p>}>
                <Late />
            </Suspense>
        </Translate>
    );
}

function SlowBlock() {
    const Late = useLate(2000, () => <p>Settled content slow</p>);
    return (
        <Translate category="Checks">
            <p>Slow block intro</p>
            <Suspense fallback={<p>Loading placeholder slow</p>}>
                <Late />
            </Suspense>
        </Translate>
    );
}

function NeverBlock() {
    const Late = useLate(null, () => <p>Settled content never</p>);
    return (
        <Translate category="Checks">
            <p>Never block intro</p>
            <Suspense fallback={<p>Loading placeholder never</p>}>
                <Late />
            </Suspense>
        </Translate>
    );
}

/** A lazy component that resolves `delay` ms after it first renders, or never. */
function useLate(delay: number | null, content: () => ReactElement) {
    const [Late] = useState(() =>
        lazy(
            () =>
                new Promise<{ default: () => ReactElement }>((resolve) => {
                    if (delay !== null) setTimeout(() => resolve({ default: content }), delay);
                })
        )
    );
    return Late;
}

/** The Accept-Language header helper for an app's own API calls. */
function LocaleHeader() {
    useT(); // re-render on locale change
    return (
        <section style={styles.card}>
            <h2>Accept-Language helper</h2>
            <p>
                <code data-check="locale-headers">{JSON.stringify(localeHeaders())}</code>
            </p>
            <p style={styles.expect}>Expect: the header follows the locale selector.</p>
        </section>
    );
}

/** What the double accepted for project p1. */
function Accepted() {
    const [state, setState] = useState<AcceptedState | null>(null);
    useEffect(() => {
        const tick = () =>
            fetch('/lsfixture/state')
                .then((r) => r.json())
                .then(setState)
                .catch(() => setState(null));
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);
    const p = state?.projects.p1;
    return (
        <section style={styles.card} data-check="accepted">
            <h2>Accepted by the double</h2>
            {!state ? (
                <p>Not reachable at /lsfixture/state.</p>
            ) : (
                <>
                    <h3>Phrases ({p?.phrases.length ?? 0})</h3>
                    <List items={(p?.phrases ?? []).map((x) => `${x.category ?? ''} · ${x.phrase}`)} />
                    <h3>Blocks ({p?.blocks.length ?? 0})</h3>
                    <List
                        items={(p?.blocks ?? []).map(
                            (b) => `${b.custom_id} · ${b.phrases.map((x) => x.phrase).join(' | ')}`
                        )}
                    />
                    <h3>Hints ({state.hints.length})</h3>
                    <List items={state.hints.map((h) => h.url)} />
                </>
            )}
        </section>
    );
}

function List({ items }: { items: string[] }): ReactNode {
    return (
        <ul style={styles.list}>
            {items.map((x, i) => (
                <li key={i}>
                    <code>{x}</code>
                </li>
            ))}
        </ul>
    );
}

function useDomIds(ref: RefObject<HTMLElement | null>): string[] {
    const [ids, setIds] = useState<string[]>([]);
    useEffect(() => {
        const read = () => {
            const found = Array.from(ref.current?.querySelectorAll('[data-ls-contentblock]') ?? []).map(
                (el) => el.getAttribute('data-ls-contentblock') ?? ''
            );
            setIds((prev) => (prev.join() === found.join() ? prev : found));
        };
        read();
        const id = setInterval(read, 500);
        return () => clearInterval(id);
    }, [ref]);
    return ids;
}

const styles: Record<string, CSSProperties> = {
    main: { fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '2rem auto', padding: '0 1rem', color: '#222' },
    card: { border: '1px solid #ddd', borderRadius: 6, padding: '0.8rem 1.2rem', margin: '1rem 0' },
    expect: { color: '#555', fontSize: '0.9rem', borderLeft: '3px solid #8ab', paddingLeft: '0.6rem' },
    list: { fontSize: '0.85rem', margin: '0.3rem 0 0.8rem' },
};
