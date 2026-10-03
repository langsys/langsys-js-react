# Langsys SDK - React

[![npm](https://img.shields.io/npm/v/langsys-js-react.svg?style=flat)](https://www.npmjs.com/package/langsys-js-react)
[![build](https://img.shields.io/github/actions/workflow/status/langsys/langsys-js-react/ci.yml?style=flat)](https://github.com/langsys/langsys-js-react/actions)
[![last commit](https://img.shields.io/github/last-commit/langsys/langsys-js-react.svg?style=flat)](https://github.com/langsys/langsys-js-react/commits)
[![commit activity](https://img.shields.io/github/commit-activity/m/langsys/langsys-js-react.svg?style=flat)](https://github.com/langsys/langsys-js-react/pulse)
[![bundle size](https://img.shields.io/bundlejs/size/langsys-js-react?style=flat)](https://bundlejs.com/?q=langsys-js-react)
[![types](https://img.shields.io/npm/types/langsys-js-react.svg?style=flat)](https://www.npmjs.com/package/langsys-js-react)
[![downloads](https://img.shields.io/npm/dm/langsys-js-react.svg?style=flat)](https://www.npmjs.com/package/langsys-js-react)
[![license](https://img.shields.io/npm/l/langsys-js-react.svg?style=flat)](./LICENSE)

Langsys revolutionizes localization for apps with easy to integrate, realtime, continuous translations. Read more about Langsys Translation Manager [at the website](https://Langsys.dev/).

Integrate the Langsys Translation Manager into your React, Next.js, Remix, or Vite applications using this SDK.

## Requirements

- **React 18 or 19** (the reactive layer is built on `useSyncExternalStore`).

## How it's layered

`langsys-js-react` is a thin React binding over the framework-agnostic [`langsys-js-typescript`](https://github.com/langsys/langsys-js-typescript) package — which owns the API client, translation lifecycle, token discovery, DOM tokenizer, and SSR-aware token strategies. This package adds only the React-native concerns:

- A `LangsysApp` whose `init` accepts a `Signal<string>` (made with `createLocaleStore`) for the user locale
- Hooks — `useT`, `useCurrentLocale`, `useTranslations`, `useLocaleStore` — that re-render components when translations or the loaded locale change
- Components — `<Translate>` (HTML content blocks), `<Phrase>` (markup-bearing phrases for pluralization), `<DontTranslate>` (never-translated regions)

If you need the SDK outside React (a Node script, a non-React web app), import from `langsys-js-typescript` directly.

## Install

```bash
npm install langsys-js-react
```

`langsys-js-typescript` is installed automatically as a transitive dependency. `react` is a peer dependency you already have.

## Creating a Langsys project

Visit [Langsys.dev](https://Langsys.dev/) to create your account, then create your project. Take note of your project ID and API key.

### API key permissions

- **Write key** (development): the SDK auto-creates new translation tokens and content blocks as they appear in your app.
- **Read-only key** (production): the SDK fetches translations only — no token creation, no content-block writes.

The SDK detects the key type automatically and behaves accordingly.

## Initialization

Initialize once, high in your tree. Create the user-locale store with `useLocaleStore` and pass it to `LangsysApp.init`:

```tsx
// src/LangsysProvider.tsx
import { useEffect, useState, type ReactNode } from 'react';
import { LangsysApp, useLocaleStore } from 'langsys-js-react';

export function LangsysGate({ children }: { children: ReactNode }) {
    const [, , localeStore] = useLocaleStore('en-US');
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        LangsysApp.init({
            projectid: import.meta.env.VITE_LANGSYS_PROJECT_ID,
            key: import.meta.env.VITE_LANGSYS_API_KEY,
            UserLocaleStore: localeStore,
            baseLocale: 'en-US',
            debug: false,
        }).then((res) => {
            if (res.status) setReady(true);
            else setError(res.errors?.join(', ') ?? 'Init failed');
        });
    }, [localeStore]);

    if (error) return <p>Langsys init failed: {error}</p>;
    if (!ready) return <p>Loading…</p>;
    return <>{children}</>;
}
```

`UserLocaleStore` is a `Signal<string>` — switch it with `setLocale(...)` (from the same `useLocaleStore` call) or `localeStore.set('fr-FR')`, and the SDK reacts. If you'd rather keep the locale store at module scope, `const localeStore = createLocaleStore('en-US')` works too.

Locale identifiers are canonicalized by the base SDK: `'en-US'`, `'EN-US'` and `'en-us'` all normalize to **lowercase** `'en-us'`. `useCurrentLocale()` and `detectPreferredLocale()` return that lowercase form, so compare against `'en-us'` — a test for `'en-US'` never matches. Normalize your own values with the re-exported `canonicalizeLocale()` rather than casing by hand.

### SSR token strategy

`ssrTokenStrategy` (default `'client'`) controls when tokens found during a *server* render are registered. It acts on an SDK instance running inside the rendering process, so it does something only if `LangsysApp.init()` has run in that process.

**In a client-only app like the one above, and in Next.js as documented in [README-SSR.md](./README-SSR.md), it is inert** — `init()` runs in a `useEffect`, which never executes on the server, so there is no instance for the option to act on. See [Discovering server-rendered content](./README-SSR.md#discovering-server-rendered-content) for what that means for content rendered in Server Components, and how `<Translate>` / `<Phrase>` cover it.

The option matters only in genuinely isomorphic deployments — a custom server, or same-process SSR where `init()` runs in the rendering process:

- `'client'` (default) — nothing is registered from the server render; content that also renders on the client is caught there.
- `'server'` — registered directly from the server render, originating from your server's IP rather than a browser's.
- `'auto'` — small batches (≤5) from the server, larger ones deferred to the client.

## Using translations

### `useT()` — the everyday API

`useT()` returns the current translation function and re-renders the component whenever translations or the loaded locale change.

```tsx
import { useT } from 'langsys-js-react';

function Welcome() {
    const t = useT();
    return (
        <>
            <h1>{t('Welcome to my app', 'UI')}</h1>
            <p>{t('Hello, {name}!', 'UI', { name: 'Sarah' })}</p>
        </>
    );
}
```

The translation function signature is **`t(phrase, category?, params?)`**:

```tsx
t('Save');                                  // no category, no params
t('Save', 'UI');                            // categorized
t('Hello, {name}!', { name: 'X' });         // no category, with params
t('Hello, {name}!', 'Greetings', { name: 'X' }); // category + params
```

The **phrase itself is the lookup key** *and* the base-language default — there's no separate keys file to maintain. The first render of a phrase registers it in the Translation Manager (when using a write key); from then on, translations are fetched and rendered automatically as locales change.

#### Interpolation

Curly-brace placeholders are substituted from the params argument:

```tsx
t('You have {count} new messages', 'Notifications', { count: 3 });
```

Placeholder names are extracted from the phrase at compile time and **type-checked**: omitting a required key or adding an extra one is a TypeScript error.

```tsx
t('You have {count} new messages', 'Notifications', {});
// ❌ Property 'count' is missing in type '{}'

t('You have {count} new messages', 'Notifications', { count: 3, extra: 'x' });
// ❌ Object literal may only specify known properties, and 'extra' does not exist
```

Allowed value types: `string | number | Date | boolean`. Since base SDK 0.3.0, values are locale-formatted: numbers go through `Intl.NumberFormat` (`1234.5` → `1.234,5` in `de-DE`) and `Date` values through `Intl.DateTimeFormat` with the medium date style (previously ISO 8601). Pass a string to opt out of formatting. Formatting always uses the catalog locale (falling back to `en`), never the host's default locale, so server and client render identically.

> Future versions will swap the simple `{name}` runtime for full ICU MessageFormat — adding plural / select — without changing the public signature. Style-less ICU arguments (`{n, number}`, `{d, date}`, `{t, time}`) already format as of base SDK 0.3.0. Today's `t('{count} items', 'Cart', { count })` will evolve to `t('{count, plural, one {# item} other {# items}}', 'Cart', { count })`.

#### Categorization disambiguates context

Different categories give the *same* phrase different translations:

```tsx
<strong>{t('Home', 'Main Menu')}</strong>     {/* "Inicio" in Spanish */}
<strong>{t('Home', 'Home repairs')}</strong>  {/* "Hogar" in Spanish */}
```

Without categorization, "Home" would only have one translation — which can't work for both contexts. Langsys's philosophy is *translate once, use everywhere*; categorize when the same phrase legitimately means different things.

A good rule for category names: the module or feature the phrase lives in (`Account`, `Errors`, `Checkout`, `UI`).

### `<Translate>` — HTML content blocks

For larger blocks of HTML where the structure should be preserved for the translator:

```tsx
import { Translate } from 'langsys-js-react';

function Article() {
    return (
        <Translate category="Blog" tag="article">
            <h1 className="title">My article title</h1>
            <p>My content <strong>is the best</strong> when internationalized by Langsys.</p>
            <p>Translators see this exactly as users do — same styling, same structure.</p>
        </Translate>
    );
}
```

The component:
- Recursively tokenizes text nodes, `<option>` text, and translatable attributes — 15 of them, not just the visible ones:
    - **Visible text:** `placeholder`, `alt`, `title`, `label`
    - **Screen-reader text:** `aria-label`, `aria-placeholder`, `aria-description`, `aria-valuetext`, `aria-roledescription` — worth knowing these are covered, since untranslated ARIA strings are invisible on the page and only surface to someone using a screen reader
    - **Validation messages:** `data-error`, `data-error-message`, `data-validation-message`, `data-invalid-message`, `data-required-message`, `data-pattern-message`
- Translates the `value` attribute **only where it is a label rather than data**: on `<button>`, and on `<input type="submit">` / `<input type="button">`. Every other input type is left alone, so a text field's value is never rewritten. This is a separate mechanism from the attribute list above — `value` is deliberately *not* in the SDK's `TRANSLATABLE_ATTRIBUTES`; it's gated by `VALUE_TRANSLATABLE_ELEMENTS` / `VALUE_TRANSLATABLE_INPUT_TYPES`.
- Registers a snapshot of the block's markup, so translators see its structure in the Translation Manager.
- Registers the whole thing as a **content block** that translators handle as one unit while still translating the individual phrases inside.
- Auto re-translates on locale change.

`<Translate>` renders its content through the core: the translated text comes back as data, and the component renders it as React elements — your own elements, with their handlers, refs and keys, in the places the translation puts them. It renders the same on a server and in the browser, so a server-rendered page arrives translated and hydrates without a mismatch, and a locale change re-renders it. Keep its children to markup and text — prose, marketing copy, forms with placeholders. For dynamic per-string values that React owns, use `useT()`.

A block whose children hold a component, `lazy`, `Suspense` or `dangerouslySetInnerHTML` cannot be rendered that way, because its content isn't known until React renders it. Such a block renders its children as they are, and the SDK translates it in the browser after it mounts; its `custom_id`, when you give one, is on the element from the first render. The SDK registers such a block once its content has stopped changing for 250 ms, so a `Suspense` fallback that resolves within that time is never registered as the block. A fallback still showing then is registered, because it is what the page shows; if it resolves later, the SDK says so in a debug notice naming both block ids. On a server the SDK warns once that it served such a block in the source language.

```tsx
{/* CMS content goes through Translate as-is */}
<Translate category="News" tag="div">
    <div dangerouslySetInnerHTML={{ __html: article?.content ?? '' }} />
</Translate>
```

Values in `<Translate>` and `<Phrase>` markup are placeholders. With the build transform enabled (one line of configuration, see [Variables in translated text](#variables-in-translated-text)), write them as you would any JSX:

```tsx
<Translate category="Cart">You have {items.length} items in your cart.</Translate>
```

The transform turns `{items.length}` into the placeholder `{items_count}` and passes the value as its param, so the sentence registers once — `You have {items_count} items in your cart.` — for every user and every count, and a translator can give it plural forms.

Without the transform, write the placeholder yourself as **`%key%`** and pass the value in `params`:

```tsx
<Translate category="Cart" params={{ count: itemCount }}>
    You have %count% items in your cart.
</Translate>
```

`%key%` passes through JSX as plain text and the SDK reads it as `{key}`; keys are identifier-shaped (`%[A-Za-z_][A-Za-z0-9_]*%`), so a stray `%` in prose ("50% off") is left alone. `params` apply to text, translatable attributes, `<option>` text and single-token content; numbers and dates get the locale's formatting, and changing `params` re-renders the block.

Without the transform, a bare `{count}` is evaluated by React before the SDK sees the text. Where it sits inside other text — `You have {count} items` — the component can tell a value was there but not what to call it, so it registers nothing for that block, renders any translation the catalog already holds, and says so once as a debug notice. Where the value is the only text of its element (`<b>{name}</b>`), it cannot be told from literal text, and the block registers the text it renders. Raw HTML is content, not a variable: a block whose only dynamic part is `dangerouslySetInnerHTML` (a CMS field, say) registers that HTML's text; one that also interpolates a value registers nothing.

`<Translate>` props: `category?`, `custom_id?`, `label?`, `params?`, `tag?` (defaults to `translate`), `className?`, `children`.

### `<Phrase>` — markup-bearing phrases (pluralization)

Keeps a run that contains inline markup as **one** translatable phrase — so a count variable stays next to the noun it pluralizes, and the translator sees the whole sentence:

```tsx
import { Phrase } from 'langsys-js-react';

<Phrase category="ProductCard" params={{ n: reviewCount }}>
    Based on %n% <strong>reviews</strong>
</Phrase>
```

The inline elements never reach the translator — they're replaced with neutral markup tokens (`{m0o}`…`{m0c}`) and the real framework-owned elements are reconstituted around the translated text at render. This is also what lets reordering languages move emphasis correctly (`<span>White</span> House` → `Casa <span>Blanca</span>`). Pass interpolation values via `params`; keep the markup children static.

> Note: write placeholders as `%n%` in `<Phrase>` markup (see the `<Translate>` note above) — a bare `{n}` in JSX is an expression and never reaches the SDK.

`<Phrase>` props: `category?`, `params?`, `tag?` (defaults to `span`), `className?`, `children`.

### `<DontTranslate>` — never-translated regions

Marks content that must be preserved verbatim (brand names, domains, code):

```tsx
import { DontTranslate } from 'langsys-js-react';

Built with <DontTranslate>Kangen®</DontTranslate> on <DontTranslate>langsys.dev</DontTranslate>
```

Renders the host with `translate="no"`, which the base SDK's tokenizer and renderer already honor — the content is never tokenized, registered, or replaced.

`<DontTranslate>` props: `tag?` (defaults to `span`), `className?`, `children`.

## Variables in translated text

A sentence that shows a value — a name, a count, a date — is one phrase however many values it is shown with. The build transform makes that automatic: inside `<Translate>`, `<Phrase>` and `t()` calls it turns each interpolated value into a named placeholder and passes the value as its param.

```tsx
<Translate>Hello {user.firstName}, welcome back</Translate>
// registers "Hello {first_name}, welcome back"

<Phrase>Signed in as <b>{user.name}</b></Phrase>
// registers "Signed in as {m0o}{name}{m0c}"

t(`You have ${inbox.count} new messages`)
// registers "You have {inbox_count} new messages"
```

Enable it with one line, for your build tool:

```ts
// vite.config.ts
import langsys from 'langsys-js-react/vite';
export default defineConfig({ plugins: [langsys(), react()] });
```

```js
// next.config.mjs — Turbopack and webpack; Next's own compiler stays on
import { withLangsys } from 'langsys-js-react/next';
export default withLangsys({ /* your config */ });
```

```json
// babel.config.json — any other Babel setup
{ "plugins": ["langsys-js-react/babel"] }
```

It only touches files that import `langsys-js-react`, and only `<Translate>` and `<Phrase>` imported from it and `t` obtained from `useT()`. String and number literals stay text; JSX, conditionals and components inside a block are left as they are.

**Names** are the same in every Langsys SDK, derived from the expression in snake_case: `user.firstName` → `first_name`, `items.length` → `items_count`, `price.value` → `price`, `formatDate(order.date)` → `date`. Two values that would share a name are told apart by the segment before it (`a.name`, `b.name` → `a_name`, `b_name`). An expression no name can be derived from — `a + b`, a ternary, a call with several arguments — is named `value`, `value_2`, … and the build warns about it; give it a name yourself with `%name%` and `params`, which always wins.

## Hooks & reactive primitives

| Export | Type | Notes |
|---|---|---|
| `useT()` | `() => TFunction` | Re-renders on translations/locale change. Call as `const t = useT(); t('Phrase', 'Cat', params?)`. |
| `useCurrentLocale()` | `() => string` | The locale whose translations are currently loaded (lags the user-selected locale until the fetch completes). |
| `useTranslations()` | `() => iCategories` | Raw translation catalog. Rarely needed in app code. |
| `useLocaleStore(initial?)` | `() => [locale, setLocale, store]` | Creates a stable user-locale `Signal<string>`, reads it reactively, returns a setter. Pass `store` to `init`. |
| `useSignal(signal)` | `<T>(s: Signal<T>) => T` | Low-level: subscribe a component to any base-SDK signal. |
| `createLocaleStore(initial?)` | `(s?: string) => Signal<string>` | Make a user-locale store outside React (module scope). |
| `t` / `currentlyLoadedLocale` / `sTranslations` | `Signal<…>` | Raw signals for direct subscription outside React. In components, prefer the hooks. |
| `canonicalizeLocale(locale)` | `(s: string) => string` | Normalize a locale identifier to the lowercase wire form (`'en-US'` → `'en-us'`) — the same normalization the SDK applies internally. |
| `useNotifyNavigation(location)` | `(location: unknown) => void` | Tells the SDK the route changed whenever `location` changes. See [Route changes](#route-changes). |
| `useRenderServerMessage()` | `() => (entry, category?) => string` | Renders server message entries, re-rendering when the locale changes. See [Server messages](#server-messages). |
| `useWriteEnabled()` | `() => boolean \| undefined` | Whether this session may register content, as decided by the server. See [Write gating](#write-gating) — the `undefined` state is meaningful. |

## Route changes

Call `useNotifyNavigation` once, anywhere under your router, with the router's current location:

```tsx
import { useNotifyNavigation } from 'langsys-js-react';

// React Router
function NavigationNotifier() {
    useNotifyNavigation(useLocation().key);
    return null;
}

// Next.js App Router
function NavigationNotifier() {
    useNotifyNavigation(usePathname() + '?' + useSearchParams());
    return null;
}
```

Content that stays mounted across a route change — a header, a sidebar, a persistent layout — is not re-rendered by React when only the route changes, so without this the SDK never learns that its phrases now appear on the new page, and discovery never credits that page with them. The hook tells the SDK the route changed; every mounted translated node then looks itself up again at the new URL. Everything else — what is reported, when, and how often — is decided by the SDK.

If your router exposes its own after-navigation callback, calling `notifyNavigation()` there is equivalent.

## Server messages

A Langsys server SDK leaves your framework's own error response exactly as it is and attaches a list of entries beside it — for Laravel, under `langsys_errors` next to the usual `errors` map in the 422 body. Each entry carries `template`, the source sentence with `{markers}`; `params`, the values that fill them; and `message`, the same sentence already filled. It also passes through what the framework reports about the failure, unchanged: `field`, in the framework's own path format, and `code`, the framework's own identifier for the failure (Laravel's `Min`, Pydantic's `string_too_short`) — use it for your logic, never to choose text.

`resolveServerMessages(body, { key })` reads the entries from where the server attached them; `useRenderServerMessage()` renders them in the current locale:

```tsx
import { resolveServerMessages, useRenderServerMessage } from 'langsys-js-react';

function FormErrors({ body }: { body: unknown }) {
    const render = useRenderServerMessage();
    return (
        <ul>
            {resolveServerMessages(body, { key: 'langsys_errors' }).map((entry, i) => (
                <li key={i}>{render(entry)}</li>
            ))}
        </ul>
    );
}
```

Pass the same `key` the server SDK is configured with — a dotted path such as `meta.langsys` works too — or a `resolver` that maps the body to entries yourself. One of the two is required: the body is never searched by shape. If the server renames the pieces, pass `pieces`, e.g. `{ template: 'sentence', message: 'text' }`. An entry needs a `template` or a `message`.

An entry renders as the translation of its `template`, filled from `params`, when the catalog has one, and as its `message` otherwise — so a message nobody has translated yet still reads correctly. An entry with no `template` shows its `message`, and `message` is never used as a lookup key. Templates are looked up under one category, `Errors` unless `messagesCategory` is set in `init`, and it has to match the category the server registers them under. The rendering function changes identity whenever the catalog or locale does, so it can be passed to memoised children.

### Inertia

After a failed form, the server SDK flashes the entries and shares them with the page it redirects to as a prop under the same key (`langsys_errors` in the Laravel package, unless configured otherwise). Resolve them from the page's props:

```tsx
import { usePage } from '@inertiajs/react';

function CardsNew() {
    const render = useRenderServerMessage();
    return resolveServerMessages(usePage().props, { key: 'langsys_errors' }).map((entry, i) => (
        <p key={i}>{render(entry)}</p>
    ));
}
```

A page that follows no failure has no such prop, and renders nothing.

## Migrating from key-based i18n

An app moving from i18next or vue-i18n can keep calling `t()` with its existing keys. Give `init` the source-language files it already has:

```tsx
import en from './locales/en.json';

LangsysApp.init({
    projectid,
    key,
    UserLocaleStore: store,
    legacyKeys: [{ name: 'en.json', format: 'i18next', data: en }],
});

const t = useT();
t('checkout.title', undefined, { name: 'Ada' }); // "Checkout for Ada" — registered as "Checkout for {name}" under "checkout"
```

`t()` then resolves its argument as a key first. A key the files hold becomes its value, converted to Langsys placeholders and ICU plurals, and that value — never the key — is the phrase Langsys registers and translates; the key's first segment is its category unless the call passes one. An argument the files do not hold is literal source text. Formats are `i18next`, `vue-i18n` and `plain` (the default); any other makes `init` throw a `LegacyFormatError` naming the file. Leave `legacyKeys` unset and `t()` does no key lookup at all. `LangsysApp.Translations.setLegacyKeys(files | null)` turns the mode on or off later.

## Catalog snapshots

A snapshot is a project's catalog exported to a file, so a first paint or an offline session renders translations with no API call. Load it before the first render:

```tsx
import snapshot from './langsys-snapshot.json';

LangsysApp.loadSnapshot(snapshot, 'es-es'); // synchronous; false if it holds no catalog for the locale
createRoot(el).render(<App />);             // the first render already has its translations
```

The snapshot is a cache, not the catalog of record: `init()` still fetches the catalog, which replaces it and supplies any phrase it lacked, and with no network anything it lacks shows its source text. Never edit a snapshot by hand — export it again. An edited file, a different format, an unsupported version or a missing member is refused with a `SnapshotError` whose `reason` says which.

## Write gating

A write-capable key shipped in public JavaScript is extractable, so **public keys are read-only**. The server decides per session whether that session may register newly-discovered phrases, and the SDK follows that decision — you never compute it client-side, because the same key can be write-enabled from one IP and read-only from another.

When a session is read-only, nothing is lost: the SDK reports the *page URL only* (never phrase content) so Langsys can visit that page from an allow-listed address and register what it finds.

### `useWriteEnabled()`

```tsx
const writeEnabled = useWriteEnabled(); // boolean | undefined
```

Three distinct states — **don't collapse them to a boolean**:

| Value | Meaning |
|---|---|
| `undefined` | Authorization hasn't landed yet. Not the same as read-only. Also the value throughout SSR, since this is decided in the browser. |
| `false` | Read-only session. The SDK may report the page URL instead, subject to the key's auto-discovery permission. |
| `true` | This session registers content directly. |

Defaulting `undefined` to `false` will render a read-only state during every first paint and, under SSR, cause a hydration mismatch.

This package deliberately does **not** re-export the raw `writeEnabled` signal. It is `undefined` for the whole of a server render, so reading it directly during render defeats the guard `useWriteEnabled()` provides. If you genuinely need it outside React's render cycle, import it from `langsys-js-typescript` directly — the capability is available, it just isn't blessed under this binding's name.

### Write grants — for login-walled apps

Content behind a login can't be reached by an external visit, so pass a short-lived JWT your backend mints at login. The server then treats the session as write-enabled.

```tsx
LangsysApp.init({
    projectid,
    key,
    UserLocaleStore: store,
    // Prefer the function form: grants are short-lived (~5 min) and the SDK
    // resolves it fresh before each request, so your auth layer decides when to
    // mint. A static string expires while the app is still mounted.
    writeGrant: () => auth.getLangsysGrant(),
});
```

If the token only exists *after* `init()` — the usual case — supply it when the user logs in:

```tsx
import { setWriteGrant } from 'langsys-js-react';

await setWriteGrant(token);   // re-authorizes; resolves once the server has answered
await setWriteGrant(undefined); // clear on logout — session returns to read-only
```

`setWriteGrant()` re-authorizes rather than merely storing the token, so `useWriteEnabled()` reflects the new decision once it resolves. Misses occurring *after* the grant lands register directly; earlier ones were already reported through the URL-reporting path.

## Server-Side Rendering (Next.js, Remix)

The SDK is SSR-compatible. The main pattern is to pre-fetch translations server-side and seed them through `initialTranslations` / `initialTranslationsLocale` so the client doesn't refetch on hydration. `useT` and friends are built on `useSyncExternalStore` with a server snapshot, so they hydrate without a flash of untranslated content when seeded.

📖 **See [README-SSR.md](./README-SSR.md)** for a complete Next.js (App Router & Pages Router) walkthrough.

## Utilities

`LangsysApp` exposes localized helpers (call them from effects / event handlers):

```tsx
import { LangsysApp, type iCountryList, type iCurrencyList, type iLocaleDefault } from 'langsys-js-react';

const countries: iCountryList   = await LangsysApp.getCountries();     // [{ code: "US", label: "United States" }, ...]
const dialCodes                 = await LangsysApp.getDialCodes();     // [{ country_code: "US", dial_code: "+1", name: "United States" }, ...]
const currencies: iCurrencyList = await LangsysApp.getCurrencies();    // [{ code: "USD", name: "US Dollar", symbol: "$", ... }, ...]
const locales: iLocaleDefault   = await LangsysApp.getLocales();       // { "English": [{ code: "en-US", name: "English (US)" }, ...], ... }
const localeName                = await LangsysApp.getLocaleNameWithLookup('es-ES', true, 'fr-FR'); // "espagnol"
```

### Detecting the user's preferred locale

```typescript
// Browser: navigator.languages → fallback to navigator.language
const locale = LangsysApp.detectPreferredLocale();
// Returns 'en-US', 'fr', etc., or false if not detected

// SSR (route handler / middleware): parses Accept-Language
const locale = LangsysApp.detectPreferredLocale(request.headers.get('Accept-Language'));

// Matched against your app's supported locales
const supportedLocales = (await LangsysApp.getLocalesFlat()).map((l) => l.code);
const locale = LangsysApp.detectPreferredLocale(request.headers.get('Accept-Language'), supportedLocales);
```

The matcher tries exact match first (e.g. `en-US`), then language-only (`en` matches `en-GB`), and is script-aware via CLDR likely-subtags (base SDK 0.3.0+): `zh-TW` matches `zh-Hant` and never falls back to `zh-Hans`. Results are returned in the SDK's canonical form, which is **lowercase** (`en-us`, `zh-hant`) — see the note under [Initialization](#initialization); it returns `false` if no match.

### Asking your own API for the user's language

`localeHeaders()` returns the request header for the locale the user chose, so your app's calls to its own API answer in that language:

```ts
import { localeHeaders } from 'langsys-js-react';

fetch('/api/orders', { headers: { ...localeHeaders() } }); // Accept-Language: es-es
```

### Waiting for translations to load

When changing locale mid-session, you may want to re-run dependent code after the new translations arrive:

```tsx
useEffect(() => {
    LangsysApp.translationsLoadingPromise.then(() => {
        // re-render content / regenerate UI here
    });
}, [locale]);
```

## License

MIT © Langsys
