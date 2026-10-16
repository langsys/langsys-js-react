// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://site.local/page"}
/**
 * VAR-6's Test, end to end: with the transform enabled (the Vite plugin, in this repo's test
 * config), components interpolating a user's value register one phrase with the placeholder
 * across users, measured against the contract fixture's stored state; the placeholder is named
 * per VAR-2; a value inside a subtree that is not translated is marked (VAR-3), so a phrase keys
 * the subtree as one empty pair (TOK-1), a block's stored content holds the placeholder, and the
 * page shows the value; and a plural translation of that phrase renders from the param.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, createElement as el, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { LangsysApp, createLocaleStore } from '../index.js';
import { startContractFixture, sleep, type ContractFixture } from '../test-helpers/contract-fixture.js';
import { catalog } from '../test-helpers/ssr-scope.js';
import {
    Account,
    AccountBlock,
    AccountHost,
    Area,
    AreaBlock,
    BigTotal,
    Byline,
    Cart,
    Rated,
    Sent,
    Codes,
    Count,
    CountPhrase,
    Credited,
    Formatted,
    Greeting,
    IconLabel,
    Inbox,
    Inventory,
    List,
    MailLater,
    Menu,
    Nick,
    Reader,
    ReplyTo,
    Schema,
    Shortcut,
    ShortcutBlock,
    Signed,
    Title,
    Today,
    Totals,
    WriteTo,
} from './fixtures/app.js';

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

    it('a value inside <DontTranslate> or translate="no" is no phrase\'s text, a block stores its placeholder, and each page shows it', async () => {
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
        // A phrase keys the subtree as one empty pair (TOK-1), the value and its marker included.
        expect(phrases('G')).toEqual(['Signed in as {m0o}{m0c} today']);
        expect(phrases('J')).toEqual(['Reply to {m0o}{m0c} soon']);
        const block = (category: string) => p.blocks.filter((b) => b.category === category);
        const blocks = { H: block('H')[0], I: block('I')[0] };
        expect([block('H').length, block('I').length]).toEqual([1, 1]);
        expect(blocks.H.phrases.map((x) => x.phrase)).toEqual(['Signed in as', 'today', 'Manage your account']);
        // A block's content holds the marked value as its placeholder, the marker removed (VAR-3).
        expect(blocks.H.content).toBe(
            '<p>Signed in as <span translate="no" data-ls-dont-translate="">{email}</span> today</p><p>Manage your account</p>',
        );
        expect(blocks.I.phrases.map((x) => x.phrase)).toEqual(['Reply to', 'soon']);
        expect(blocks.I.content).toBe('<p>Reply to <span translate="no">{email}</span> soon</p>');
        expect(JSON.stringify(p)).not.toMatch(/example\.com/);
    }, 60_000);

    // The build cannot read `translate={mode}` or `data-notrans={true}`, and the core shows code and
    // notation as written: each value there is marked, which reads correctly whether the element
    // turns out excluded or not.
    it('a value under an opt-out known only at runtime, or inside notation, shows and is not stored', async () => {
        const users = ['ana@example.com', 'bo@example.com'];
        const texts: string[] = [];
        for (const email of users) {
            texts.push(await show(el(WriteTo, { user: { email }, mode: 'no' })));
            texts.push(await show(el(WriteTo, { user: { email }, mode: 'yes' })));
            texts.push(await show(el(MailLater, { user: { email } })));
        }
        for (const area of ['12 m²', '30 m²']) {
            texts.push(await show(el(Area, { area })));
            texts.push(await show(el(AreaBlock, { area })));
        }
        await sleep(1500);

        expect(texts).toEqual([
            ...users.flatMap((email) => [`Write to ${email} now`, `Write to ${email} now`, `Mail ${email} later`]),
            'Area 12 m² units',
            'Area 12 m² units',
            'Area 30 m² units',
            'Area 30 m² units',
        ]);
        const p = (await fx.state()).projects.p1;
        expect(p.phrases.filter((x) => x.category === 'M').map((x) => x.phrase)).toEqual(['Area {m0o}{m0c} units']);
        // The block would store the area in its content, where no marker can stand: it registers nothing.
        expect([...p.phrases, ...p.blocks].filter((x) => x.category === 'N')).toEqual([]);
        expect(JSON.stringify(p)).not.toMatch(/example\.com|m²/);
    }, 60_000);

    // Each value names its own unit: a nested <Phrase> keys as it does standalone, whatever value the
    // enclosing <Translate> holds (VAR-2).
    it('a <Phrase> nested in a <Translate>, both holding a value, keys as the same phrase standalone', async () => {
        const texts: string[] = [];
        for (const [user, owner] of [['Ana', 'Cy'], ['Bo', 'Di']]) {
            texts.push(await show(el(Credited, { user: { name: user }, owner: { name: owner } })));
        }
        await sleep(1500);
        const nested = (await fx.state()).projects.p1.phrases.filter((x) => x.category === 'P').map((x) => x.phrase);
        texts.push(await show(el(Byline, { owner: { name: 'Cy' } })));
        await sleep(1500);
        const phrases = (await fx.state()).projects.p1.phrases;

        expect(texts).toEqual(['Hi AnaBy Cy', 'Hi BoBy Di', 'By Cy']);
        expect(nested).toEqual(['By {name}']);
        expect(phrases.filter((x) => x.category === 'P').map((x) => x.phrase)).toEqual(['By {name}']);
        expect(phrases.filter((x) => x.category === 'O').map((x) => x.phrase)).toEqual(['Hi {name}']);
    }, 60_000);

    // A value React renders as nodes is not text: `{children}` and an expression holding JSX are left
    // alone, and a param that turns out to be an element or an array is put back where it stood.
    it('children, elements and lists render as nodes; a number under a runtime opt-out is formatted only when translated', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        const html = async (node: ReactNode) => {
            await act(async () => root.render(node));
            return host.innerHTML.replace(/ data-ls-[a-z-]+="[^"]*"/g, '');
        };
        expect(await html(el(Title, null, 'Welcome'))).toBe('<h1>Welcome</h1>');
        expect(await html(el(Title, null, el('b', null, 'Hi')))).toBe('<h1><b>Hi</b></h1>');
        expect(await html(el(IconLabel, { icon: el('svg', { role: 'img' }) }))).toBe('<translate>Click <svg role="img"></svg> to go</translate>');
        expect(await html(el(IconLabel, { icon: '→' }))).toBe('<translate>Click → to go</translate>');
        expect(await html(el(List, { items: ['a', 'b'] }))).toBe('<translate><ul><li>a</li><li>b</li></ul></translate>');
        // An escaped literal reads back as written; a value React renders as nothing shows nothing.
        expect(await html(el(Menu, { name: 'Ana' }))).toBe('<translate>Open File &gt; Save as Ana</translate>');
        expect(await html(el(Nick, { nick: undefined }))).toBe('<translate>Hi !</translate>');
        expect(await html(el(Nick, { nick: null }))).toBe('<translate>Hi !</translate>');
        // Translated, the param fills the marked placeholder in the current locale's format.
        expect(await html(el(Count, { n: 1234567, mode: 'yes' }))).toMatch(/Total <span translate="yes"><span>1[.,]234[.,]567<\/span><\/span> items/);
        expect(await html(el(Count, { n: 1234567, mode: 'no' }))).toContain('Total <span translate="no"><span>1234567</span></span> items');
        await act(async () => root.unmount());
        host.remove();
        await sleep(1500);
        const p = (await fx.state()).projects.p1;
        // Children are the content: a string and an element's text register as they render.
        expect(p.phrases.filter((x) => x.category === 'R').map((x) => x.phrase).sort()).toEqual(['Hi', 'Welcome']);
        expect(p.phrases.filter((x) => 'VW'.includes(x.category!)).map((x) => `${x.category}:${x.phrase}`).sort()).toEqual([
            'V:Open File > Save as {name}',
            'W:Hi {nick}!',
        ]);
        expect(JSON.stringify(p)).not.toMatch(/object Object|1[.,]?234[.,]?567/);
    }, 60_000);

    it('children beside text and a value in a fragment register once; one in raw text or a text-only element registers nothing', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        const html = async (node: ReactNode) => {
            await act(async () => root.render(node));
            return host.innerHTML.replace(/ data-ls-[a-z-]+="[^"]*"/g, '');
        };
        const shown: string[] = [];
        for (const name of ['Ana', 'Bo']) {
            shown.push(await html(el(Reader, null, `the ${name} guide`)));
            shown.push(await html(el(Today, { name })));
            shown.push(await html(el(Schema, { json: `{"author":"${name}@example.com"}` })));
            shown.push(await html(el(Codes, { code: `${name}-1` })));
        }
        shown.push(await html(el(Reader, null, el('b', null, 'terms'))));
        await act(async () => root.unmount());
        host.remove();
        expect(shown).toEqual([
            '<span>Read the Ana guide</span>',
            '<translate>Hi Ana today</translate>',
            '<translate><p>Our store</p><script type="application/ld+json">{"author":"Ana@example.com"}</script></translate>',
            '<translate><p>Pick a code</p><select translate="no"><option value="Ana-1" selected="">Ana-1</option></select></translate>',
            '<span>Read the Bo guide</span>',
            '<translate>Hi Bo today</translate>',
            '<translate><p>Our store</p><script type="application/ld+json">{"author":"Bo@example.com"}</script></translate>',
            '<translate><p>Pick a code</p><select translate="no"><option value="Bo-1" selected="">Bo-1</option></select></translate>',
            '<span>Read <b>terms</b></span>',
        ]);
        await sleep(1500);
        expect((await stored()).filter((x) => /^[XYZQ]:/.test(x))).toEqual(['X:Read {children}', 'X:Read {m0o}terms{m0c}', 'Y:Hi {name} today']);
        expect(JSON.stringify((await fx.state()).projects.p1)).not.toMatch(/Ana|Bo-1|Bo@/);
    }, 60_000);

    // Whichever way a runtime opt-out turns out, the unit renders its values, formatted where they are
    // translated, and registers the sentence with placeholders, never a value.
    it('values beside and under an opt-out known only at runtime render and register, in both components', async () => {
        const shown: string[] = [];
        for (const [name, k, mode] of [['Ana', 'Ctrl+S', 'yes'], ['Bo', 'Cmd+S', 'yes'], ['Ana', 'Ctrl+S', 'no'], ['Bo', 'Cmd+S', 'no']] as const) {
            shown.push(await show(el(Shortcut, { user: { name }, k, mode })));
            shown.push(await show(el(ShortcutBlock, { user: { name }, k, mode })));
        }
        for (const mode of ['yes', 'no'] as const) {
            shown.push(await show(el(CountPhrase, { n: 3, mode })));
            shown.push(await show(el(Count, { n: 4, mode })));
        }
        await sleep(1500);
        expect(shown).toEqual([
            ...['yes', 'no'].flatMap(() => [
                'Hello Ana, press Ctrl+S now',
                'Hello Ana, press Ctrl+S now',
                'Hello Bo, press Cmd+S now',
                'Hello Bo, press Cmd+S now',
            ]),
            'Total 3 items',
            'Total 4 items',
            'Total 3 items',
            'Total 4 items',
        ]);
        // Each opt-out stores its own form: the value's place as a placeholder where it is translated,
        // and the excluded element as an empty pair (a phrase) or as written (a block's content).
        expect((await stored()).filter((x) => /^(KP|KB|UP|U):/.test(x))).toEqual([
            'KB:BLOCK[Hello {name}, press|now]',
            'KB:BLOCK[Hello {name}, press|{k}|now]',
            'KP:Hello {name}, press {m0o}{k}{m0c} now',
            'KP:Hello {name}, press {m0o}{m0c} now',
            'U:BLOCK[Total|items]',
            'U:BLOCK[Total|{n}|items]',
            'UP:Total {m0o}{m0c} items',
            'UP:Total {m0o}{n}{m0c} items',
        ]);
        expect(JSON.stringify((await fx.state()).projects.p1)).not.toMatch(/Ana|Ctrl|Cmd/);

    }, 60_000);

    // A phrase holding a marker is served as its source before a translation exists, markers and all:
    // every value in it is marked, so each shows as written, never as a placeholder.
    it('values beside a marker of its own, and a bigint under a runtime opt-out, show as written before any translation', async () => {
        const big = BigInt('12345678901234567890');
        const shown = [
            await show(el(Inventory, { user: { name: 'Ana' }, count: 3 })),
            await show(el(BigTotal, { big, mode: 'no' })),
            await show(el(BigTotal, { big, mode: 'yes' })),
        ];
        shown.push(await show(el(Sent, { user: { name: 'Ana' }, file: { name: 'report.pdf' } })));
        shown.push(await show(el(Rated, { n: 3, label: 'stars' })));
        expect(shown).toEqual([
            'Hello Ana, you have 3 items',
            'Total 12345678901234567890 items',
            'Total 12345678901234567890 items',
            'Ana sent report.pdf',
            'Rated 3 stars',
        ]);
        await sleep(1500);
        expect((await stored()).filter((x) => /^H[1345]:/.test(x))).toEqual([
            'H1:Hello {name}, you have {count} items',
            'H3:Total {m0o}{big}{m0c} items',
            'H3:Total {m0o}{m0c} items',
            'H4:{user_name} sent {name}',
        ]);
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
