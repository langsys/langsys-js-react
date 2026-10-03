'use client';
import { useEffect, useState } from 'react';
import { LangsysApp, Translate, createLocaleStore, useCurrentLocale, useT } from 'langsys-js-react';

/**
 * A client component under <LangsysProvider>. On the server it renders the request's locale
 * from the provider's scope; in the browser it hydrates from the same catalog. `?key=public`
 * initializes the browser with the read-only key instead of the write key.
 */
export function Client({ locale }: { locale: string }) {
    const t = useT();
    const loaded = useCurrentLocale();
    const [store] = useState(() => createLocaleStore(locale));
    const [count, setCount] = useState(3);
    const [user] = useState({ firstName: 'Ana' });

    useEffect(() => {
        const key = new URLSearchParams(window.location.search).get('key') === 'public' ? 'k-public' : 'k-writer';
        void LangsysApp.init({
            projectid: 'p1',
            key,
            UserLocaleStore: store,
            baseLocale: 'en',
            apiUrl: `${window.location.origin}/lsapi`,
            ssrTokenStrategy: 'server',
            debug: true,
        });
    }, [store]);

    return (
        <section>
            <p data-check="client">{t('Rendered in a client component', 'Next')}</p>
            <p data-check="loaded-locale">Loaded locale: {loaded}</p>
            <p data-check="cart">{t(`You have ${count} items in your cart`, 'Checks')}</p>
            <button onClick={() => setCount((n) => n + 1)}>Add item</button>
            <Translate category="Next">
                <p>Hello {user.firstName}, this block is rendered by a client component.</p>
                <p>Its id is on the element in the server HTML.</p>
            </Translate>
        </section>
    );
}
