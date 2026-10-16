/**
 * Components written as an app writes them, importing the package by name. The placeholder
 * transform rewrites them when they are loaded (spec VAR-6); nothing here names a placeholder.
 */
import { Fragment, type ReactNode } from 'react';
import { DontTranslate, Phrase, Translate, useT } from 'langsys-js-react';

// React's JSX types carry no MathML elements; the fixtures below use two.
declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            math: { children?: unknown };
            mi: { children?: unknown };
        }
    }
}

export function Greeting({ user }: { user: { firstName: string } }) {
    return <Translate category="A">Hello {user.firstName}, welcome back</Translate>;
}

export function Cart({ items }: { items: unknown[] }) {
    return <Translate category="B">You have {items.length} items</Translate>;
}

export function Signed({ user }: { user: { name: string } }) {
    return (
        <Phrase category="C">
            Signed in as <b>{user.name}</b>
        </Phrase>
    );
}

export function Inbox({ inbox }: { inbox: { count: number } }) {
    const t = useT();
    return <p>{t(`You have ${inbox.count} new messages`, 'D')}</p>;
}

export function Totals({ a, b, c, d }: { a: number; b: number; c: number; d: number }) {
    return <Translate category="E">Sum {a + b}, product {c * d}</Translate>;
}

const fmt = (n: number) => `#${n}`;

export function Formatted({ a, b, c, d }: { a: number; b: number; c: number; d: number }) {
    const t = useT();
    return <p>{t(`${fmt(a + b)} of ${fmt(c * d)}`, 'F')}</p>;
}

type Account = { user: { email: string } };

export function Account({ user }: Account) {
    return (
        <Phrase category="G">
            Signed in as <DontTranslate>{user.email}</DontTranslate> today
        </Phrase>
    );
}

export function AccountBlock({ user }: Account) {
    return (
        <Translate category="H">
            <p>Signed in as <DontTranslate>{user.email}</DontTranslate> today</p>
            <p>Manage your account</p>
        </Translate>
    );
}

export function AccountHost({ user }: Account) {
    return (
        <Translate category="I">
            <p>Reply to <span translate="no">{user.email}</span> soon</p>
        </Translate>
    );
}

export function ReplyTo({ user }: Account) {
    return (
        <Phrase category="J">
            Reply to <span translate="no">{user.email}</span> soon
        </Phrase>
    );
}

export function WriteTo({ user, mode }: Account & { mode: 'yes' | 'no' }) {
    return (
        <Translate category="K">
            <p>Write to <span translate={mode}>{user.email}</span> now</p>
        </Translate>
    );
}

export function MailLater({ user }: Account) {
    return (
        <Translate category="L">
            <p>Mail <span data-notrans={true}>{user.email}</span> later</p>
        </Translate>
    );
}

export function Area({ area }: { area: string }) {
    return (
        <Phrase category="M">
            Area <math><mi>{area}</mi></math> units
        </Phrase>
    );
}

export function AreaBlock({ area }: { area: string }) {
    return (
        <Translate category="N">
            <p>Area <math><mi>{area}</mi></math> units</p>
        </Translate>
    );
}

type Credit = { user: { name: string }; owner: { name: string } };

export function Credited({ user, owner }: Credit) {
    return (
        <Translate category="O">
            <p>Hi {user.name}</p>
            <Phrase category="P">By {owner.name}</Phrase>
        </Translate>
    );
}

export function Byline({ owner }: Pick<Credit, 'owner'>) {
    return <Phrase category="P">By {owner.name}</Phrase>;
}

export function Title({ children }: { children: ReactNode }) {
    return (
        <Translate category="R" tag="h1">
            {children}
        </Translate>
    );
}

export function IconLabel({ icon }: { icon: ReactNode }) {
    return <Translate category="S">Click {icon} to go</Translate>;
}

export function List({ items }: { items: string[] }) {
    return (
        <Translate category="T">
            <ul>
                {items.map((i) => (
                    <li key={i}>{i}</li>
                ))}
            </ul>
        </Translate>
    );
}

export function Count({ n, mode }: { n: number; mode: 'yes' | 'no' }) {
    return (
        <Translate category="U">
            <p>Total <span translate={mode}>{n}</span> items</p>
        </Translate>
    );
}

export function Menu({ name }: { name: string }) {
    return <Translate category="V">Open File {'>'} Save as {name}</Translate>;
}

export function Nick({ nick }: { nick?: string | null }) {
    return <Translate category="W">Hi {nick}!</Translate>;
}

export function Reader({ children }: { children: ReactNode }) {
    return <Phrase category="X">Read {children}</Phrase>;
}

export function Today({ name }: { name: string }) {
    return (
        <Translate category="Y">
            Hi <Fragment>{name}</Fragment> today
        </Translate>
    );
}

export function Schema({ json }: { json: string }) {
    return (
        <Translate category="Z">
            <p>Our store</p>
            <script type="application/ld+json">{json}</script>
        </Translate>
    );
}

export function Codes({ code }: { code: string }) {
    return (
        <Translate category="Q">
            <p>Pick a code</p>
            <select translate="no" defaultValue={code}>
                <option value={code}>{code}</option>
            </select>
        </Translate>
    );
}

export function CountPhrase({ n, mode }: { n: number; mode: 'yes' | 'no' }) {
    return (
        <Phrase category="UP">
            Total <span translate={mode}>{n}</span> items
        </Phrase>
    );
}

export function Shortcut({ user, k, mode }: { user: { name: string }; k: string; mode: 'yes' | 'no' }) {
    return (
        <Phrase category="KP">
            Hello {user.name}, press <kbd translate={mode}>{k}</kbd> now
        </Phrase>
    );
}

export function ShortcutBlock({ user, k, mode }: { user: { name: string }; k: string; mode: 'yes' | 'no' }) {
    return (
        <Translate category="KB">
            <p>
                Hello {user.name}, press <kbd translate={mode}>{k}</kbd> now
            </p>
        </Translate>
    );
}

export function Inventory({ user, count }: { user: { name: string }; count: number }) {
    return (
        <Phrase category="H1">
            Hello {user.name}, you have <span data-ls-param="count">{count}</span> items
        </Phrase>
    );
}

export function BigTotal({ big, mode }: { big: bigint; mode: 'yes' | 'no' }) {
    return (
        <Phrase category="H3">
            Total <b translate={mode}>{big}</b> items
        </Phrase>
    );
}

export function Sent({ user, file }: { user: { name: string }; file: { name: string } }) {
    return (
        <Translate category="H4">
            {user.name} sent <span data-ls-param="name">{file.name}</span>
        </Translate>
    );
}

export function Rated({ n, label }: { n: number; label: string }) {
    return (
        <Phrase category="H5">
            Rated <span data-ls-param="n">{n}</span>{' '}
            <svg>
                <title>{label}</title>
            </svg>
        </Phrase>
    );
}
