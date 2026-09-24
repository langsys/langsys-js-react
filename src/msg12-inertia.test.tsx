// @vitest-environment jsdom
/**
 * MSG-12, the binding's half: an Inertia page that follows a failed form renders the entries
 * handed to it as a page prop, through `useRenderServerMessage`.
 *
 * The app is mounted with the real `@inertiajs/react` and submits with its real router over
 * HTTP. The server here stands in for the server SDK's half, which langsys-php-laravel proves
 * against Inertia's own middleware: a failed POST flashes the entries and redirects, and the
 * next page load shares them under `langsys_errors` (that package's default key) and drops
 * them afterwards. A page that follows no failure carries no such prop.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App, router, usePage } from '@inertiajs/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentlyLoadedLocale, sTranslations } from 'langsys-js-typescript';
import { resolveServerMessages, useRenderServerMessage, type ServerMessage } from './index.js';
import { until } from './test-helpers/contract-fixture.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const vectors = JSON.parse(
    readFileSync(resolve(__dirname, '../vectors/server-message-vectors.json'), 'utf8'),
) as { canonical_entries: ServerMessage[] };
const [, , tooShort, mismatch] = vectors.canonical_entries;
const PROP = 'langsys_errors';

let flashed: ServerMessage[] | null = null;
let server: Server;
let base: string;

function page(url: string) {
    const props: Record<string, unknown> = { errors: {} };
    if (flashed) props[PROP] = flashed;
    flashed = null;
    return { component: 'Cards/New', props, url, version: null, rescuedProps: [], flash: {} };
}

function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url!, base);
    req.resume();
    // The page's origin is jsdom's, so the visit is cross-origin: answer CORS like any API would.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'X-Inertia');
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Methods': 'GET, POST',
            'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '',
        }).end();
        return;
    }
    if (req.method === 'POST' && url.pathname === '/cards') {
        flashed = [tooShort, mismatch];
        res.writeHead(302, { Location: '/cards/new' }).end();
        return;
    }
    if (req.method === 'GET' && req.headers['x-inertia']) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'X-Inertia': 'true', Vary: 'X-Inertia' });
        res.end(JSON.stringify(page(url.pathname)));
        return;
    }
    res.writeHead(404).end();
}

function CardsNew() {
    const props = usePage().props as Record<string, unknown>;
    const render = useRenderServerMessage();
    const entries = resolveServerMessages(props[PROP]);
    return createElement(
        'ul',
        { id: 'errors' },
        entries.map((entry, i) => createElement('li', { key: i, 'data-field': entry.field }, render(entry))),
    );
}

let root: Root;
let host: HTMLElement;
const items = () => [...host.querySelectorAll('#errors li')].map((li) => li.textContent);

beforeAll(async () => {
    server = createServer(handle);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const categories = {
        __uncategorized__: { __category__: '__uncategorized__', __symbol__: '__uncategorized__' },
        Errors: {
            __category__: 'Errors',
            __symbol__: 'Errors',
            [tooShort.template]: 'La contraseña debe tener al menos {min} caracteres.',
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
            }),
        );
    });
});

afterAll(async () => {
    await act(async () => root.unmount());
    await new Promise((r) => server.close(r));
});

describe('MSG-12 Inertia hand-off', () => {
    it('a page that follows no failure renders no entries', () => {
        expect(host.querySelector('#errors')).not.toBeNull();
        expect(items()).toEqual([]);
    });

    it('the page a failed form redirects to renders the entries from its prop', async () => {
        await act(async () => {
            router.post(`${base}/cards`, { cc_number: '' });
        });
        await until(() => items().length > 0, 5000);
        expect(items()).toEqual(['La contraseña debe tener al menos 12 caracteres.', mismatch.message]);
    });

    it('the entries are gone once the next page load no longer carries them', async () => {
        await act(async () => {
            router.get(`${base}/cards/new`);
        });
        await until(() => items().length === 0, 5000);
        expect(items()).toEqual([]);
    });
});
