# Testing this branch locally

How to run `langsys-js-react` on this branch against the local core build, and see each
feature work in a browser. Two apps are used:

- **The Vite playground** (`example/`, `npm run dev`). Its feature-checks page, `/?checks=1`,
  has one visible check per feature and a live panel of what the server accepted.
- **A Next.js App Router app** (`example-next/`), for the build transform under Next and
  per-request server rendering.

Both talk to the **contract double**, an in-memory Langsys API that ships in
`contract-fixture/`. A local Langsys works too; see [Against a local Langsys](#against-a-local-langsys).

## 1. Link the local core

This branch needs the core from `langsys-js-typescript`'s `feature/838_write_key_gating_reland`
branch. The registry's published version (the one `package.json` names) predates it.

```sh
cd ../langsys-js-typescript
git checkout feature/838_write_key_gating_reland && git pull
npm ci && npm run build

cd ../langsys-js-react
npm ci
ln -sfn ../../langsys-js-typescript node_modules/langsys-js-typescript   # point the dependency at the local build
npm test                                                               # 29 files pass; 2 tests are expected failures
```

The symlink lives in `node_modules` only, so nothing tracked changes. `npm ci` or `npm install`
replaces it with the registry version; run the `ln` line again afterwards.

## 2. Start the contract double

```sh
npm run fixture            # http://127.0.0.1:8787; `npm run fixture -- --port 9000` for another port
```

It seeds one project, `p1`, with base locale `en`, target `es-es`, and a few Spanish
translations (`example/fixture-seed.json`). It has two keys:

| Key        | What the server decides                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `k-writer` | The session may write, so misses are registered.                          |
| `k-public` | Read-only. Nothing is registered; the page is reported as a hint instead. |

`http://127.0.0.1:8787/__fixture/state` shows what the double has accepted. Restarting it
starts from the seed again. The browser console shows `404` errors for `locales/…/data`,
because the double doesn't serve the locale list; they don't affect anything below.

If you use another port, set `LANGSYS_FIXTURE_URL=http://127.0.0.1:<port>` for both apps below.

## 3. The feature checks (Vite)

```sh
npm run dev                # http://localhost:5173/?checks=1
```

Each section of the page names what to expect. The **Accepted by the double** panel at the
bottom re-reads the double every second; use it to confirm each check. The page imports the
package by name, so the placeholder transform (`langsys-js-react/vite`) runs on it as it does
in an app.

| Feature                            | What to do                                                | What you should see                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Translations and locale            | Switch the locale to `es-es`.                             | The title becomes “Comprobaciones”, and “loaded locale” becomes `es-es`.                                                                                                                                                                                                                                                                                                                                           |
| `<Translate>` blocks and ids       | Load the page.                                            | The ids line shows `checks-explicit` and a derived 32-character id. Under Accepted, one block for each id. ([README: `<Translate>`](README.md#translate--html-content-blocks))                                                                                                                                                                                                                                     |
| Placeholders through the transform | Click **Switch user** and **Add item** a few times.       | Accepted holds `Welcome back, {first_name}.` and `You have {count} items in your cart` once each, never a name or a number. In `es-es` the cart line reads “Tienes 3 artículos en tu carrito”. ([README: Variables](README.md#variables-in-translated-text))                                                                                                                                                       |
| Suspense settle window             | Click the three **Mount** buttons.                        | **fast**: only the block with “Settled content fast” is stored, and no notice. React keeps a shown fallback up for at least 300 ms, which is inside the 500 ms settle window. **never**: a block with “Loading placeholder never” is stored once 500 ms pass. **slow**: the placeholder block, then the settled block, plus one console debug notice naming both ids (“…changed its structure after it settled…”). |
| Hints (read-only key)              | Open `/?checks=1&key=public` on a freshly started double. | write_enabled is `false`, and no new phrase or block is accepted. 5–30 s after load, the page's URL appears under Hints. ([README: Write gating](README.md#write-gating))                                                                                                                                                                                                                                          |
| Accept-Language helper             | Switch the locale.                                        | The line shows `{"Accept-Language":"en"}`, then `{"Accept-Language":"es-es"}`. ([README](README.md#asking-your-own-api-for-the-users-language))                                                                                                                                                                                                                                                                    |

The default playground page (`/`) is the demo against a real project. `/?testbed=1` is the
write-gating end-to-end testbed driven by `npm run test:e2e`.

## 4. Next.js App Router (`example-next/`)

The example installs this package and the core from tarballs, as an app installs them from npm.
Rebuild the tarballs whenever either package changes.

```sh
npm run build && npm pack --pack-destination example-next/vendor
(cd ../langsys-js-typescript && npm pack --pack-destination ../langsys-js-react/example-next/vendor)

cd example-next
npm install
npm install --no-save ./vendor/*.tgz     # again after any plain `npm install`
npm run dev                              # http://localhost:3000 (redirects to /en); also /es-es
```

`next.config.mjs` is `withLangsys({...})`. The root layout opens one request scope per request,
and passes its seed to `<LangsysProvider>`. `app/Client.tsx` is a client component that uses
`useT()`, a `t()` call with an interpolated count, and a `<Translate>` with an interpolated
name. The pattern is documented in [README-SSR: Next.js](README-SSR.md#nextjs).

| Feature                               | What to do                                                                                     | What you should see                                                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-request locale on the server      | `curl -s localhost:3000/es-es` and `curl -s localhost:3000/en`, together or one after another. | `/es-es` serves “Renderizado en el servidor”, “Renderizado en un componente de cliente” and “Tienes 3 artículos en tu carrito” in the HTML itself. `/en` serves the English. Neither request ever shows the other's language. |
| Block id in the server HTML           | Look at the `/es-es` HTML.                                                                     | `<translate data-ls-contentblock="…">` around the client component's block.                                                                                                                                                   |
| Hydration from the seed               | Open `/es-es` in a browser with the console open.                                              | No hydration warning, the page stays in Spanish after load, and **Add item** updates the Spanish sentence.                                                                                                                    |
| `withLangsys` transform               | Look at Accepted (`http://127.0.0.1:8787/__fixture/state`) after a visit.                      | The block is stored as `Hello {first_name}, …` and the cart phrase as `You have {count} items in your cart`.                                                                                                                  |
| Server misses sent after the response | Load any page once.                                                                            | `A server phrase the catalog lacks` is accepted. The layout's `after(() => scope.close())` sends it from the server.                                                                                                          |
| Read-only browser                     | Restart the double, then open `/es-es?key=public`.                                             | The browser registers nothing: the only new phrase is the server's own miss, sent by the server. The page's hint appears under `hints` 5–30 s later.                                                                          |

`npm run build && npm start` exercises the production build. `npm run build -- --webpack` (or
`npx next dev --webpack`) exercises the transform through webpack instead of Turbopack.

## Against a local Langsys

The playground's demo page reads `VITE_LANGSYS_PROJECT_ID` and `VITE_LANGSYS_API_KEY` from
`.env` (see `.env.example`). The end-to-end testbed (`/?testbed=1`, `npm run test:e2e`) also
reads `VITE_LANGSYS_BASE_URL`, `VITE_LANGSYS_KEY_READ`, `VITE_LANGSYS_KEY_IP_WRITE` and
`VITE_LANGSYS_KEY_WRITE`, plus `LANGSYS_WRITE_GRANT_SECRET` for the grant cases. Point
`VITE_LANGSYS_BASE_URL` at the local API (`http://langsys2.test/api`). The feature checks and
`example-next/` can be pointed there too: proxy `/lsapi` to the local API in `vite.config.ts` or
`example-next/next.config.mjs`, and use that project's id and keys in `example/Checks.tsx` and
`example-next/app`.

## The automated suite

`npm test` runs every rule this package implements against the same contract double, at the
evidence level recorded in [CONFORMANCE.md](CONFORMANCE.md). `npm run typecheck` must be clean.
