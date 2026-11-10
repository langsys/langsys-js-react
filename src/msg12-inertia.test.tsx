// @vitest-environment jsdom
/**
 * MSG-12, the binding's half: an Inertia page that follows a failed form renders the entries
 * handed to it as a page prop, through `useRenderServerMessage`.
 *
 * The app is mounted with the real `@inertiajs/react` and submits with its real router. The
 * transport is Inertia's own seam for it, `http.setClient`: an in-process client stands in for
 * the server SDK's half, with no listening server, since nothing here asserts on a server's
 * answer. langsys-php-laravel proves that half against Inertia's own middleware: a failed POST
 * flashes the entries and redirects, and the next page load shares them under `langsys_errors`
 * (that package's default key) and drops them afterwards. The page reads them from its props
 * through that same key, as configured on the server. A page that follows no failure carries no
 * such prop.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App, http, router, usePage } from '@inertiajs/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentlyLoadedLocale, sTranslations } from 'langsys-js-typescript';
import { resolveServerMessages, useRenderServerMessage, type ServerMessage } from './index.js';
import { until as untilPolling } from './test-helpers/contract-fixture.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const vectors = JSON.parse(readFileSync(resolve(__dirname, '../vectors/server-message-vectors.json'), 'utf8')) as {
    canonical_entries: Array<ServerMessage & { template: string; message: string }>;
};
// Laravel's own messages, as its server SDK attaches them: `min.string` and `in`.
const [, tooShort, mismatch] = vectors.canonical_entries;
const PROP = 'langsys_errors';

type HttpClient = ReturnType<typeof http.getClient>;

const BASE = 'http://app.test';
/** Nothing here reads an API, so it polls fast. */
const until = (check: () => boolean, timeoutMs = 5000) => untilPolling(check, timeoutMs, 25);

let flashed: ServerMessage[] | null = null;

function page(url: string) {
    const props: Record<string, unknown> = { errors: {} };
    if (flashed) props[PROP] = flashed;
    flashed = null;
    return { component: 'Cards/New', props, url, version: null, rescuedProps: [], flash: {} };
}

const inertia = (body: unknown) => ({
    status: 200,
    data: JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'x-inertia': 'true', vary: 'X-Inertia' },
});

/** The application's side of Inertia's transport, in-process: the page a visit lands on, after any redirect. */
const app: HttpClient = {
    async request(config) {
        const url = new URL(config.url, BASE);
        const method = config.method.toUpperCase();
        // A failed POST flashes the entries and redirects to the form, which is the response the visit lands on.
        if (method === 'POST' && url.pathname === '/cards') {
            flashed = [tooShort, mismatch];
            return inertia(page('/cards/new'));
        }
        if (method === 'GET' && url.pathname === '/cards/new') return inertia(page(url.pathname));
        throw new Error(`no route for ${method} ${url.pathname}`);
    },
};

function CardsNew() {
    const props = usePage().props as Record<string, unknown>;
    const render = useRenderServerMessage();
    const entries = resolveServerMessages(props, { key: PROP });
    return createElement(
        'ul',
        { id: 'errors' },
        entries.map((entry, i) => createElement('li', { key: i, 'data-field': entry.field }, render(entry)))
    );
}

let root: Root;
let host: HTMLElement;
let restoreClient: HttpClient;
const items = () => [...host.querySelectorAll('#errors li')].map((li) => li.textContent);

beforeAll(async () => {
    restoreClient = http.getClient();
    http.setClient(app);

    const categories = {
        __uncategorized__: { __category__: '__uncategorized__', __symbol__: '__uncategorized__' },
        Errors: {
            __category__: 'Errors',
            __symbol__: 'Errors',
            [tooShort.template]: 'El campo contraseña debe tener al menos {min} caracteres.',
        },
    };
    sTranslations.set(categories as never);
    currentlyLoadedLocale.set('es');

    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
        root.render(
            createElement(App, {
                initialPage: page('/cards/new') as never,
                initialComponent: CardsNew,
                resolveComponent: () => CardsNew,
            })
        );
    });
});

afterAll(async () => {
    await act(async () => root.unmount());
    http.setClient(restoreClient);
});

describe('MSG-12 Inertia hand-off', () => {
    it('a page that follows no failure renders no entries', () => {
        expect(host.querySelector('#errors')).not.toBeNull();
        expect(items()).toEqual([]);
    });

    it('the page a failed form redirects to renders the entries from its prop', async () => {
        await act(async () => {
            router.post(`${BASE}/cards`, { cc_number: '' });
        });
        await until(() => items().length > 0, 5000);
        expect(items()).toEqual(['El campo contraseña debe tener al menos 12 caracteres.', mismatch.message]);
    });

    it('the entries are gone once the next page load no longer carries them', async () => {
        await act(async () => {
            router.get(`${BASE}/cards/new`);
        });
        await until(() => items().length === 0, 5000);
        expect(items()).toEqual([]);
    });
});
