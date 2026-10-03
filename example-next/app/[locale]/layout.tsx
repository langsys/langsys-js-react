import type { ReactNode } from 'react';
import { after } from 'next/server';
import { LangsysApp, createSignal } from 'langsys-js-typescript';
import { createRequestScope } from 'langsys-js-react/server';
import { LangsysProvider } from '../langsys-client';

const fixture = process.env.LANGSYS_FIXTURE_URL ?? 'http://127.0.0.1:8787';

// The server's own SDK instance, initialized once per process with a write key, so the misses
// a request records are sent from the server after the response (the `server` strategy).
let ready: Promise<unknown> | null = null;
function initServer() {
    ready ??= LangsysApp.init({
        projectid: 'p1',
        key: 'k-writer',
        UserLocaleStore: createSignal('en'),
        baseLocale: 'en',
        apiUrl: `${fixture}/api`,
        ssrTokenStrategy: 'server',
    });
    return ready;
}

export default async function LocaleLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    await initServer();
    // One scope per request: everything rendered for it reads this locale and catalog.
    const scope = await createRequestScope({ locale, url: `http://localhost:3000/${locale}` });
    after(() => scope.close()); // hands this request's misses to the SDK once the response is sent
    return (
        <html lang={locale}>
            <body
                style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '2rem auto', padding: '0 1rem' }}
            >
                <p data-check="server">{scope.t('Rendered on the server', 'Next')}</p>
                <p data-check="server-miss">{scope.t('A server phrase the catalog lacks', 'Next')}</p>
                <LangsysProvider seed={scope.seed()}>{children}</LangsysProvider>
            </body>
        </html>
    );
}
