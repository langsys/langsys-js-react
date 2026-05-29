import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
// In your own app this import is `from 'langsys-js-react'`. The playground
// imports the source directly so library edits hot-reload.
import { LangsysApp, Translate, useCurrentLocale, useLocaleStore, useT } from '../src/index';

const LOCALES = [
    { code: 'en-us', label: 'English (US)' },
    { code: 'es-es', label: 'Español' },
    { code: 'fr-fr', label: 'Français' },
    { code: 'de-de', label: 'Deutsch' },
];

export function App() {
    const [locale, setLocale, localeStore] = useLocaleStore('en-us');
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const projectid = import.meta.env.VITE_LANGSYS_PROJECT_ID;
        const key = import.meta.env.VITE_LANGSYS_API_KEY;
        if (!projectid || !key) {
            setError('Missing VITE_LANGSYS_PROJECT_ID or VITE_LANGSYS_API_KEY in .env');
            return;
        }
        LangsysApp.init({
            projectid,
            key,
            UserLocaleStore: localeStore,
            baseLocale: 'en-us',
            debug: true,
        }).then((res) => {
            if (res?.status === false) setError(res.errors?.join(', ') ?? 'Init failed');
            else setReady(true);
        });
    }, [localeStore]);

    if (error) return <ErrorScreen error={error} />;
    if (!ready) return <main style={styles.main}><p>Loading Langsys…</p></main>;
    return <Demo locale={locale} setLocale={setLocale} />;
}

function Demo({ locale, setLocale }: { locale: string; setLocale: (l: string) => void }) {
    // `useT()` re-renders this component whenever translations or the loaded
    // locale change. The phrase is the lookup key and the base-language default;
    // signature is `t(phrase, category?, params?)`.
    const t = useT();
    const loadedLocale = useCurrentLocale();

    return (
        <main style={styles.main}>
            <h1>{t('Welcome to the Langsys + React demo', 'Demo')}</h1>
            <p>{t('Pick a locale below — translations update everywhere.', 'Demo')}</p>

            <div style={styles.row}>
                <label htmlFor="locale">{t('Locale', 'UI')}:</label>
                <select id="locale" value={locale} onChange={(e) => setLocale(e.target.value)}>
                    {LOCALES.map((l) => (
                        <option key={l.code} value={l.code}>
                            {l.label}
                        </option>
                    ))}
                </select>
            </div>

            <section style={styles.card}>
                <h2>{t('Direct phrase translation', 'Demo')}</h2>
                <p>
                    {t(
                        'Each phrase in your code is its own token. The first render registers the phrase with the Translation Manager; subsequent locale changes fetch and re-render automatically.',
                        'Demo'
                    )}
                </p>
            </section>

            <section style={styles.card}>
                <h2>{t('Interpolation', 'Demo')}</h2>
                <p>{t('Hello, {name}! You have {count} new messages.', 'Greetings', { name: 'Sarah', count: 3 })}</p>
                <p style={styles.muted}>
                    {t(
                        'Placeholders in the phrase above are required and type-checked at compile time — try removing a key from the params object to see the error.',
                        'Demo'
                    )}
                </p>
            </section>

            <section style={styles.card}>
                <h2>{t('Categorization disambiguates context', 'Demo')}</h2>
                <ul>
                    <li>
                        <strong>{t('Home', 'Main Menu')}</strong> <em>{t('(menu item)', 'Demo')}</em>
                    </li>
                    <li>
                        <strong>{t('Home', 'Home repairs')}</strong> <em>{t('(the building)', 'Demo')}</em>
                    </li>
                </ul>
            </section>

            <Translate category="Demo" label="Block demo" tag="section" className="card">
                <h2>HTML content blocks</h2>
                <p>
                    Wrap richer content in <code>&lt;Translate&gt;</code> and the SDK registers the whole thing as a{' '}
                    <strong>content block</strong> — translators see your styling and structure as the user sees it.
                    Attribute values like <em>placeholder</em>, <em>alt</em>, <em>aria-label</em> are also harvested.
                </p>
                <p>
                    <input type="text" placeholder="Type something here…" />
                </p>
            </Translate>

            <p style={styles.footer}>
                {t('Current locale', 'UI')}: <code>{loadedLocale}</code>
            </p>
        </main>
    );
}

function ErrorScreen({ error }: { error: string }) {
    return (
        <main style={styles.main}>
            <h1 style={{ color: '#c00' }}>Langsys init failed</h1>
            <p style={{ fontFamily: 'monospace' }}>{error}</p>
            <p>
                Copy <code>.env.example</code> to <code>.env</code>, fill in your project ID + API key, and restart{' '}
                <code>npm run dev</code>.
            </p>
        </main>
    );
}

const styles: Record<string, CSSProperties> = {
    main: { fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem', color: '#222' },
    row: { display: 'flex', gap: '1rem', alignItems: 'center', margin: '1rem 0' },
    card: { border: '1px solid #ddd', borderRadius: 6, padding: '1rem 1.2rem', margin: '1rem 0' },
    muted: { color: '#666', fontSize: '0.9rem' },
    footer: { color: '#666', marginTop: '2rem' },
};
