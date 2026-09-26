// @vitest-environment jsdom
/**
 * `useRenderServerMessage` against the shared server-message vectors (spec MSG-1, MSG-5).
 *
 * The vector file is vendored byte-exact from langsys-js-typescript, which owns it; its blob is
 * pinned below so a drifted copy fails here rather than rowing against the wrong vectors. The
 * resolution and fallback decisions are the core's. What this proves is the binding's half:
 * every resolve row answers the same through this package's re-export, every render row comes
 * out of a React component through the hook, and the component re-renders when the catalog
 * arrives after it has mounted.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, memo } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { currentlyLoadedLocale, sTranslations } from 'langsys-js-typescript';
import {
    resolveServerMessages,
    useRenderServerMessage,
    type ResolveServerMessagesOptions,
    type ServerMessage,
} from './index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VECTORS_PATH = resolve(__dirname, '../vectors/server-message-vectors.json');
const VECTORS_BLOB = '7333e3919dac43af81c6c20bfdba974efd79725b';

type Catalog = Record<string, Record<string, string>> | null;
type RenderRow = { id: string; locale: string; category: string; catalog: Catalog; entry: ServerMessage; expected: string };
const raw = readFileSync(VECTORS_PATH);
type ResolveRow = { id: string; body: unknown; options: ResolveServerMessagesOptions; expected: ServerMessage[]; body_unchanged?: boolean };
const doc = JSON.parse(raw.toString('utf8')) as {
    render: RenderRow[];
    resolve: ResolveRow[];
    canonical_entries: Array<ServerMessage & { template: string; message: string }>;
};

function publish(catalog: Catalog, locale: string) {
    const categories: Record<string, Record<string, string>> = {
        __uncategorized__: { __category__: '__uncategorized__', __symbol__: '__uncategorized__' },
    };
    for (const [category, entries] of Object.entries(catalog ?? {})) {
        categories[category] = { __category__: category, __symbol__: category, ...entries };
    }
    sTranslations.set(categories as never);
    currentlyLoadedLocale.set(locale);
}

function Messages({ entries, category }: { entries: ServerMessage[]; category?: string }) {
    const render = useRenderServerMessage();
    return createElement(
        'ul',
        null,
        entries.map((entry, i) => createElement('li', { key: i }, render(entry, category))),
    );
}

let root: Root | undefined;
let host: HTMLElement | undefined;

function mount(entries: ServerMessage[], category?: string): HTMLElement {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(createElement(Messages, { entries, category })));
    return host;
}

afterEach(() => {
    act(() => root?.unmount());
    host?.remove();
    root = undefined;
    publish(null, 'en');
});

describe('server-message vectors', () => {
    it('are the owner-authored file, byte for byte', () => {
        const blob = createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex');
        expect(blob).toBe(VECTORS_BLOB);
        expect(doc.render).toHaveLength(12);
    });

    it.each(doc.resolve.map((r) => [r.id, r] as const))('resolve row %s, through the re-export', (_id, row) => {
        const before = JSON.stringify(row.body);
        expect(resolveServerMessages(row.body, row.options)).toEqual(row.expected);
        if (row.body_unchanged) expect(JSON.stringify(row.body)).toBe(before);
    });

    it.each(doc.render.map((r) => [r.id, r] as const))('render row %s, through the hook', (_id, row) => {
        publish(row.catalog, row.locale);
        const el = mount([row.entry], row.category);
        expect(el.querySelector('li')!.textContent).toBe(row.expected);
    });
});

describe('useRenderServerMessage', () => {
    it('re-renders a mounted list when the catalog arrives', () => {
        const password = doc.canonical_entries[1];
        publish(null, 'es');
        const el = mount([password]);
        expect(el.textContent).toBe(password.message);

        act(() =>
            publish(
                { Errors: { [password.template]: 'El campo contraseña debe tener al menos {min} caracteres.' } },
                'es',
            ),
        );
        expect(el.textContent).toBe('El campo contraseña debe tener al menos 12 caracteres.');
    });

    it('changes identity when the catalog changes, so a memoised child re-renders', () => {
        const password = doc.canonical_entries[1];
        const Line = memo(function Line({ render, entry }: { render: (e: ServerMessage) => string; entry: ServerMessage }) {
            return createElement('span', null, render(entry));
        });
        function List() {
            const render = useRenderServerMessage();
            return createElement(Line, { render, entry: password });
        }
        publish(null, 'es');
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        act(() => root!.render(createElement(List)));
        expect(host.textContent).toBe(password.message);

        act(() =>
            publish(
                { Errors: { [password.template]: 'El campo contraseña debe tener al menos {min} caracteres.' } },
                'es',
            ),
        );
        expect(host.textContent).toBe('El campo contraseña debe tener al menos 12 caracteres.');
    });

    it('renders the entries resolved by key from two frameworks\' native 422 bodies alike', () => {
        const bodies = doc.resolve.filter((r) => r.id === 'laravel-422-body' || r.id === 'fastapi-422-body');
        expect(bodies).toHaveLength(2);
        const [laravel, fastapi] = bodies.map((r) => resolveServerMessages(r.body, r.options));
        publish({ Errors: { [laravel[0].template!]: 'El campo contraseña debe tener al menos {min} caracteres.' } }, 'es');
        const el = mount([...laravel, ...fastapi]);
        const texts = [...el.querySelectorAll('li')].map((li) => li.textContent);
        expect(texts[0]).toBe('El campo contraseña debe tener al menos 12 caracteres.');
        // Untranslated entries from either body show their own message.
        expect(texts.slice(1)).toEqual([...laravel.slice(1), ...fastapi].map((e) => e.message));
    });
});
