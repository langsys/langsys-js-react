# Testing locally

How to run `langsys-js-react` against a real Langsys API, see each feature work in a browser, and
run the automated suites. Two apps are used:

- **The Vite playground** (`example/`, `npm run dev`). Its feature-checks page, `/?checks=1`,
  has one visible check per feature and a live panel of what the API accepted.
- **A Next.js App Router app** (`example-next/`), for the build transform under Next and
  per-request server rendering.

Both reach the API through the **contract fixture's forwarder** (`contract-fixture/forwarder.mjs`,
vendored from `langsys-js-typescript`), which passes every `/api` route to a real Langsys API and
holds no state of its own. The API is an **SDK test clone**, a local Langsys seeded before the run
(langsys `docs/sdk-test-clone.md`), or a developer's own Langsys holding the playground's project;
see [Against a local Langsys](#against-a-local-langsys).

## 1. The core

The core, `langsys-js-typescript`, is a published dependency (`^0.7.3` in `package.json`), and
`npm ci` installs it from the registry. To try an unpublished core build, link it in
`node_modules` only and never commit the change:

```sh
cd ../langsys-js-typescript && npm ci && npm run build
cd ../langsys-js-react && npm ci
ln -sfn ../../langsys-js-typescript node_modules/langsys-js-typescript
```

`npm ci` or `npm install` replaces the link with the registry version.

## 2. Start the forwarder

The playground's project is a seed file, `_dev_/contract/seeds/playground.json`, declared in
`src/test-helpers/contract-seeds/playground.ts`. The clone is seeded from the folder with the
contract tests' seed files (`php tests/Sdk/reseed.php` in the clone's langsys checkout, with the
folder in the clone's `SDK_TEST_SEED_PATHS`), and a reseed clears what a visit registered.

```sh
LANGSYS_CONTRACT_TARGET=https://api.langsys5.test \
LANGSYS_CONTRACT_CLONE_ROOT=~/Documents/dev/langsys5 \
NODE_EXTRA_CA_CERTS=~/.config/valet/CA/LaravelValetCASelfSigned.pem \
npm run fixture            # http://127.0.0.1:8787; `npm run fixture -- --port 9000` for another port
```

`LANGSYS_CONTRACT_TARGET` is the API's origin and `LANGSYS_CONTRACT_CLONE_ROOT` its langsys
checkout, which the forwarder reads accepted hints from; `NODE_EXTRA_CA_CERTS` is the certificate
a local HTTPS API is served with. The script names the playground's case to the forwarder: its
project, keys and caller address. It exits with a message when the first two are missing.

The project, `78000900-0001-4000-8000-000000000000`, has base locale `en`, target `es-es`, and a
few Spanish translations. It has two keys:

| Key                           | What the server decides                                                   |
| ----------------------------- | ------------------------------------------------------------------------- |
| `react-playground-1-k-writer` | The session may write, so misses are registered.                          |
| `react-playground-1-k-public` | Read-only. Nothing is registered; the page is reported as a hint instead. |

`http://127.0.0.1:8787/__fixture/state?project=<id>` shows the hints the API accepted. What it
accepted otherwise is read through its own routes: the catalog the playground's panel shows
(`GET /translations`). The API allows five hints a minute from one address and stores a page's
hint once a minute.

If you use another port, set `LANGSYS_FIXTURE_URL=http://127.0.0.1:<port>` for both apps below.

## 3. The feature checks (Vite)

```sh
npm run dev                # http://localhost:5173/?checks=1
```

Each section of the page names what to expect. The **Accepted by the API** panel at the
bottom re-reads the project's catalog and hints every second; use it to confirm each check. The page imports the
package by name, so the placeholder transform (`langsys-js-react/vite`) runs on it as it does
in an app.

| Feature                            | What to do                                              | What you should see                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Translations and locale            | Switch the locale to `es-es`.                           | The title becomes “Comprobaciones”, and “loaded locale” becomes `es-es`.                                                                                                                                                                                                                                                                                                                                           |
| `<Translate>` blocks and ids       | Load the page.                                          | The ids line shows `checks-explicit` and a derived 32-character id. Under Accepted, one block for each id. ([README: `<Translate>`](README.md#translate--html-content-blocks))                                                                                                                                                                                                                                     |
| Placeholders through the transform | Click **Switch user** and **Add item** a few times.     | Accepted holds `Welcome back, {first_name}.` and `You have {count} items in your cart` once each, never a name or a number. In `es-es` the cart line reads “Tienes 3 artículos en tu carrito”. ([README: Variables](README.md#variables-in-translated-text))                                                                                                                                                       |
| Suspense settle window             | Click the three **Mount** buttons.                      | **fast**: only the block with “Settled content fast” is stored, and no notice. React keeps a shown fallback up for at least 300 ms, which is inside the 500 ms settle window. **never**: a block with “Loading placeholder never” is stored once 500 ms pass. **slow**: the placeholder block, then the settled block, plus one console debug notice naming both ids (“…changed its structure after it settled…”). |
| Hints (read-only key)              | Open `/?checks=1&key=public` on a freshly seeded clone. | write_enabled is `false`, and no new phrase or block is accepted. 5–30 s after load, the page's URL appears under Hints. ([README: Write gating](README.md#write-gating))                                                                                                                                                                                                                                          |
| Accept-Language helper             | Switch the locale.                                      | The line shows `{"Accept-Language":"en"}`, then `{"Accept-Language":"es-es"}`. ([README](README.md#asking-your-own-api-for-the-users-language))                                                                                                                                                                                                                                                                    |

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
| `withLangsys` transform               | Look at the catalog the API serves the writer key (`GET /api/translations`) after a visit.     | The block is stored as `Hello {first_name}, …` and the cart phrase as `You have {count} items in your cart`.                                                                                                                  |
| Server misses sent after the response | Load any page once.                                                                            | `A server phrase the catalog lacks` is accepted. The layout's `after(() => scope.close())` sends it from the server.                                                                                                          |
| Read-only browser                     | Reseed the clone, then open `/es-es?key=public`.                                               | The browser registers nothing: the only new phrase is the server's own miss, sent by the server. The page's hint appears under `hints` 5–30 s later.                                                                          |

`npm run build && npm start` exercises the production build. `npm run build -- --webpack` (or
`npx next dev --webpack`) exercises the transform through webpack instead of Turbopack.

## Against a local Langsys

The playground's demo page reads `VITE_LANGSYS_PROJECT_ID` and `VITE_LANGSYS_API_KEY` from
`.env` (see `.env.example`). The end-to-end testbed (`/?testbed=1`, `npm run test:e2e`) also
reads `VITE_LANGSYS_BASE_URL`, `VITE_LANGSYS_KEY_READ`, `VITE_LANGSYS_KEY_IP_WRITE` and
`VITE_LANGSYS_KEY_WRITE`, plus `LANGSYS_WRITE_GRANT_SECRET` for the grant cases. Point
`VITE_LANGSYS_BASE_URL` at the local API (`http://langsys2.test/api`). The feature checks and
`example-next/` use the forwarder's project and keys (`example/playground-world.mjs` reads them
from `_dev_/contract/seeds/playground.json`); against a Langsys that is not a clone, create that
project and those keys in it as the seed file declares them, and start the forwarder with
`LANGSYS_CONTRACT_TARGET` at it.

## The automated suite

`npm test` needs no clone and opens no listening socket. It runs the unit suites, the seed-file
check (`src/seed-files.test.ts`: each file in `_dev_/contract/seeds` is its worlds' rendering and
passes the clone's refusal table) and the tests of what this binding sends or does in-process,
which use an in-process stand-in for the transport (`src/test-helpers/stub-api.ts`). Nothing a
stand-in answers is evidence of what a Langsys API does.

`npm run test:contract` runs the `*.contract.test.ts(x)` files, the evidence at the `contract`
tier of [CONFORMANCE.md](CONFORMANCE.md) (spec CONF-2). They run against an SDK test clone through
the forwarder, and throw without one:

```sh
LANGSYS_CONTRACT_TARGET=https://api.langsys5.test \
LANGSYS_CONTRACT_CLONE_ROOT=~/Documents/dev/langsys5 \
NODE_EXTRA_CA_CERTS=~/.config/valet/CA/LaravelValetCASelfSigned.pem \
npm run test:contract
```

Reseed the clone first: each case takes a project of its own from `_dev_/contract/seeds`, and what
a run writes stays until the next reseed (`php tests/Sdk/reseed.php` in the clone's checkout, and
`php artisan migrate:fresh --seed --force` in its langsys-ai's). A case reads its world back
through the API before it acts, and fails as `seed not landed` when the clone was not reseeded.
After editing a world in `src/test-helpers/contract-seeds`, write the JSON again with
`npx vitest run --project unit src/seed-files.test.ts -u` and reseed.

`npm run typecheck` must be clean.
