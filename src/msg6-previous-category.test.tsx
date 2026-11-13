// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * MSG-5 and MSG-6's previous category, on the client: with the messages category `Messages` and
 * its previous category `Errors`, configured through `init()` as the core defines them, a template
 * whose translation the catalog holds only under `Errors` renders that translation through
 * `useRenderServerMessage()`, after the lookup under `Messages` and before the fallback to
 * `message`. The decision is the core's (`renderServerMessage` calls `t()` in the move form); the
 * binding's half is that both settings reach it through `iLangsysInitConfig` by inheritance and
 * that the hook renders what the core renders. The transport is a stand-in, and the catalog it
 * answers is the test's own: what a server registers is MSG-7 and MSG-8's, not a client's.
 */
import { act, createElement as el } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    LangsysApp,
    createLocaleStore,
    currentlyLoadedLocale,
    useRenderServerMessage,
    type iLangsysInitConfig,
    type ServerMessage,
} from './index.js';
import { until as untilPolling } from './test-helpers/contract-fixture.js';
import { STUB_API_URL, stubApi, type StubbedApi } from './test-helpers/stub-api.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const until = (check: () => boolean, timeoutMs = 8000) => untilPolling(check, timeoutMs, 25);

const MOVED: ServerMessage = { template: 'The {field} field is required.', params: { field: 'email' }, message: 'The email field is required.' };
const BOTH: ServerMessage = { template: 'Too many attempts.', params: {}, message: 'Too many attempts.' };
const NEITHER: ServerMessage = { template: 'The {field} is taken.', params: { field: 'name' }, message: 'The name is taken.' };

let api: StubbedApi;

beforeAll(async () => {
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    api = stubApi({
        catalog: {
            'es-es': {
                Errors: {
                    'The {field} field is required.': 'El campo {field} es obligatorio.',
                    'Too many attempts.': 'Demasiados intentos (Errors).',
                },
                Messages: { 'Too many attempts.': 'Demasiados intentos.' },
            },
        },
    });
    // Typed as the React config, so both settings are part of it by inheritance.
    const config: iLangsysInitConfig = {
        projectid: 'stub-project',
        key: 'stub-key',
        UserLocaleStore: createLocaleStore('es-es'),
        baseLocale: 'en',
        messagesCategory: 'Messages',
        messagesPreviousCategory: 'Errors',
    };
    await LangsysApp.init({ ...config, apiUrl: STUB_API_URL } as never);
    await until(() => currentlyLoadedLocale.get() === 'es-es');
});
afterAll(() => {
    api.restore();
});

function Messages({ entries, category }: { entries: ServerMessage[]; category?: string }) {
    const render = useRenderServerMessage();
    return el('ul', null, entries.map((entry, i) => el('li', { key: i }, render(entry, category))));
}

async function rendered(entries: ServerMessage[], category?: string): Promise<string[]> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(el(Messages, { entries, category })));
    const items = [...host.querySelectorAll('li')].map((li) => li.textContent ?? '');
    await act(async () => root.unmount());
    host.remove();
    return items;
}

describe('a renamed messages category (MSG-6), rendered through useRenderServerMessage (MSG-5)', () => {
    it("renders the previous category's translation, after the new category's and before message", async () => {
        expect(await rendered([MOVED, BOTH, NEITHER])).toEqual([
            'El campo email es obligatorio.',
            'Demasiados intentos.',
            'The name is taken.',
        ]);
    });

    it('a category given at the call that is not the configured one names no move', async () => {
        expect(await rendered([MOVED, BOTH], 'Errors')).toEqual(['El campo email es obligatorio.', 'Demasiados intentos (Errors).']);
        expect(await rendered([MOVED, BOTH], 'Notices')).toEqual(['The email field is required.', 'Too many attempts.']);
    });
});
