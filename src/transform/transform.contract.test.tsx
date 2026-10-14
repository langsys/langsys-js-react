// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * VAR-6's Test, end to end: with the transform enabled (the Vite plugin, in this repo's test
 * config), components interpolating a user's value register one phrase with the placeholder
 * across users, measured against the contract fixture's stored state; the placeholder is named
 * per VAR-2; a value inside a subtree that is not translated is marked (VAR-3), so the phrase and
 * the block's stored content hold its placeholder and the page shows the value; and a plural
 * translation of that phrase renders from the param.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangsysApp, createLocaleStore } from '../index.js';
import { startContractFixture, sleep, type ContractFixture } from '../test-helpers/contract-fixture.js';
import { catalog } from '../test-helpers/ssr-scope.js';
import { Account, AccountBlock, AccountHost, Cart, Formatted, Greeting, Inbox, ReplyTo, Signed, Totals } from './fixtures/app.js';

let fx: ContractFixture;

beforeAll(async () => {
    fx = await startContractFixture();
    await fx.seed({
        projects: [{ id: 'p1', base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local' }],
        keys: [{ key: 'k-writer', project: 'p1', type: 'write' }],
    });
    for (const m of ['log', 'info', 'group', 'groupCollapsed', 'groupEnd', 'warn', 'error', 'debug'] as const) {
        vi.spyOn(console, m).mockImplementation(() => {});
    }
    await LangsysApp.init({
        projectid: 'p1',
        key: 'k-writer',
        UserLocaleStore: createLocaleStore('en'),
        baseLocale: 'en',
        apiUrl: fx.baseUrl,
    } as never);
});
afterAll(async () => {
    await fx.stop();
});

async function show(node: ReactNode): Promise<string> {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(node));
    const text = host.textContent ?? '';
    await sleep(500);
    await act(async () => root.unmount());
    host.remove();
    return text;
}

/** Every string the double stored, as `category:phrase` (a block as its phrases). */
async function stored(): Promise<string[]> {
    const p = (await fx.state()).projects.p1;
    return [
        ...p.phrases.map((x) => `${x.category}:${x.phrase}`),
        ...p.blocks.map((b) => `${b.category}:BLOCK[${b.phrases.map((x) => x.phrase).join('|')}]`),
    ].sort();
}

describe('the placeholder transform, rendered for several users', () => {
    it('each sentence registers once, with its placeholder, and renders each user\'s value', async () => {
        const texts: string[] = [];
        for (const firstName of ['Ana', 'Bo']) texts.push(await show(el(Greeting, { user: { firstName } })));
        for (const n of [1, 3]) texts.push(await show(el(Cart, { items: Array(n).fill(0) })));
        for (const name of ['Ana', 'Bo']) texts.push(await show(el(Signed, { user: { name } })));
        for (const count of [2, 9]) texts.push(await show(el(Inbox, { inbox: { count } })));
        for (const v of [{ a: 1, b: 2, c: 3, d: 4 }, { a: 2, b: 3, c: 5, d: 6 }]) {
            texts.push(await show(el(Totals, v)));
            texts.push(await show(el(Formatted, v)));
        }
        await sleep(1500);

        expect(texts).toEqual([
            'Hello Ana, welcome back',
            'Hello Bo, welcome back',
            'You have 1 items',
            'You have 3 items',
            'Signed in as Ana',
            'Signed in as Bo',
            'You have 2 new messages',
            'You have 9 new messages',
            // Two unnameable values are two placeholders: each shows its own value.
            'Sum 3, product 12',
            '#3 of #12',
            'Sum 5, product 30',
            '#5 of #30',
        ]);
        expect(await stored()).toEqual([
            'A:Hello {first_name}, welcome back',
            'B:You have {items_count} items',
            'C:Signed in as {m0o}{name}{m0c}',
            'D:You have {inbox_count} new messages',
            'E:Sum {value}, product {value_2}',
            'F:{value} of {value_2}',
        ]);
    }, 60_000);

    it('a plural translation of the registered phrase renders from the param', async () => {
        LangsysApp.seedCatalog(
            catalog({
                B: { 'You have {items_count} items': '{items_count, plural, one {Tienes # artículo} other {Tienes # artículos}}' },
                A: { 'Hello {first_name}, welcome back': 'Hola {first_name}, bienvenido de nuevo' },
            }),
            'es-es',
        );
        expect(await show(el(Cart, { items: [0] }))).toBe('Tienes 1 artículo');
        expect(await show(el(Cart, { items: [0, 0, 0] }))).toBe('Tienes 3 artículos');
        expect(await show(el(Greeting, { user: { firstName: 'Ana' } }))).toBe('Hola Ana, bienvenido de nuevo');
    }, 30_000);

    it('a value inside <DontTranslate> or translate="no" registers as its placeholder and shows as it is', async () => {
        const users = ['ana@example.com', 'bo@example.com'];
        const texts: string[] = [];
        for (const email of users) {
            texts.push(await show(el(Account, { user: { email } })));
            texts.push(await show(el(AccountBlock, { user: { email } })));
            texts.push(await show(el(AccountHost, { user: { email } })));
            texts.push(await show(el(ReplyTo, { user: { email } })));
        }
        await sleep(1500);

        expect(texts).toEqual(
            users.flatMap((email) => [
                `Signed in as ${email} today`,
                `Signed in as ${email} todayManage your account`,
                `Reply to ${email} soon`,
                `Reply to ${email} soon`,
            ]),
        );
        const p = (await fx.state()).projects.p1;
        const phrases = (category: string) => p.phrases.filter((x) => x.category === category).map((x) => x.phrase);
        expect(phrases('G')).toEqual(['Signed in as {m0o}{email}{m0c} today']);
        expect(phrases('J')).toEqual(['Reply to {m0o}{email}{m0c} soon']);
        const block = (category: string) => p.blocks.filter((b) => b.category === category);
        const blocks = { H: block('H')[0], I: block('I')[0] };
        expect([block('H').length, block('I').length]).toEqual([1, 1]);
        expect(blocks.H.phrases.map((x) => x.phrase)).toEqual(['Signed in as', 'today', 'Manage your account']);
        expect(blocks.H.content).toBe(
            '<p>Signed in as <span translate="no" data-ls-dont-translate=""><span data-ls-param="email">{email}</span></span> today</p>' +
                '<p>Manage your account</p>',
        );
        expect(blocks.I.phrases.map((x) => x.phrase)).toEqual(['Reply to', 'soon']);
        expect(blocks.I.content).toBe('<p>Reply to <span translate="no"><span data-ls-param="email">{email}</span></span> soon</p>');
        expect(JSON.stringify(p)).not.toMatch(/example\.com/);
    }, 60_000);

    it('a marked value in a <Phrase> shows its new value when it changes', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        await act(async () => root.render(el(Account, { user: { email: 'cy@example.com' } })));
        expect(host.textContent).toBe('Signed in as cy@example.com today');
        await act(async () => root.render(el(Account, { user: { email: 'di@example.com' } })));
        expect(host.textContent).toBe('Signed in as di@example.com today');
        await act(async () => root.unmount());
        host.remove();
    });
});
