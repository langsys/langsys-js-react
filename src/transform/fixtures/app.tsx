/**
 * Components written as an app writes them, importing the package by name. The placeholder
 * transform rewrites them when they are loaded (spec VAR-6); nothing here names a placeholder.
 */
import { Phrase, Translate, useT } from 'langsys-js-react';

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
