# CONFORMANCE — langsys-js-react

Conformance of this **binding** against the SDK Behaviour Spec.

| | |
|---|---|
| **Spec revision read** | langsys2 c1b16560…, docs/sdk-spec.mdx blob e22dad188f1c1e6a972961cdf9675a84d891f5ec |
| **Profiles** | browser, binding, all — derived: binding over langsys-js-typescript |
| specVersion | **8.2.10** — 113 rules |
| Revision derived with | `git -C ~/Documents/dev/langsys2 rev-parse c1b16560d0a5191a736e63b7975d79e8625db8d3:docs/sdk-spec.mdx` → `e22dad188f1c1e6a972961cdf9675a84d891f5ec`, after `git fetch origin` at 2026-09-24T05:02:25Z. Re-derive on every write; never carry this row forward. |
| Repo state | branch `feature/838_write_gating_reland` |
| Core consumed | `langsys-js-typescript` `feature/838_write_key_gating_reland` @ `86871033e3894d6c3e2bfb19011230c2dd346a2e`, a clean build in its own worktree (`npm ci && npm run build`), reached through a gitignored `node_modules` symlink. Derived with `cd node_modules/langsys-js-typescript && git rev-parse HEAD`. |
| Core's own grading | The core's CONFORMANCE at `86871033` is graded against blob `286dcfe4` (8.2.9). 8.2.10 differs from it in GATE-10 alone — the readers are DOM hosts, and a bare `t()` under a resolved ancestor still registers — so every other delegated row reads the same under both. Delegated rows cite the core's status as recorded there. |
| Contract fixture | `contract-fixture/`, vendored byte-exact from the core; tree `542f57f5ffcb9038db1b7411152b7e31b96cb269` (`git rev-parse 86871033:contract-fixture`). |
| Vectors | `vectors/server-message-vectors.json`, vendored byte-exact from the core; blob `c8125549cfee0f5286f79a8cbc194cd30ccd446e`, pinned by a test row. |
| Suite | **69 tests / 14 files**, green (`npm test`), typecheck clean. Transcribed from the run. |

## Tally

Computed from the status table below, not hand-counted.

| Status | Rows |
|---|---|
| `delegated` | 69 |
| `not implemented` | 16 |
| `implemented` | 13 |
| `n/a (profile: server)` | 10 |
| `partial` | 4 |
| `n/a (architecture: …)` | 1 |
| **total** | **113** |

**Not green.** 20 rows are open, on three conditions.

- **The operator's ruling on server rendering** — MARK-1, SRV-1, SRV-2, SRV-3, SRV-4, SRV-5. They bind this binding whenever it renders inside a server request scope (Next, Remix). SRV-2 is a measured cross-visitor leak: the catalog is process-global, so one visitor can be served another's language. Where request-scoped catalogs and server-render capture live — the JS Server adapters or the bindings — is undecided, and nothing is built until it is.
- **Core rules not yet built** — MIG-1, MIG-2, MIG-3, MIG-4, MIG-5, MIG-6, MIG-7, MIG-8, SNAP-2, SNAP-3. The core records them `not implemented`; this binding has nothing to delegate to and authors none of it.
- **Core rules partly built** — REG-10, TOK-6, MARK-2, MARK-3. The core records the missing half; this binding inherits it.

## Scope

A **binding**: it inherits the browser core's profile and adds nothing of its own, so most rules are the core's to satisfy. Rows take one of these shapes:

- **`implemented` · `contract` / `n/a (pure)`** — behaviour this binding owns. `contract` rows run against the vendored fixture and assert on its accepted state; `n/a (pure)` rows are proven in-process (jsdom), by shared vectors, or by artifact inspection with a positive control.
- **`delegated` · `-`** — the core owns it. Evidence names the core's row and an absence probe proving this binding does not participate, with the probe's firing control.
- **`not implemented` / `partial` · `-`** — the rule binds this package and the behaviour is absent or incomplete, here or in the core it delegates to.

## Status

| Rule | Status | Tier | Evidence |
|---|---|---|---|
| GATE-1 | delegated | - | Core row GATE-1: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-2 | delegated | - | Core row GATE-2: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-3 | delegated | - | Core row GATE-3: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-4 | delegated | - | Core row GATE-4: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-5 | delegated | - | Core row GATE-5: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-6 | delegated | - | Core row GATE-6: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-7 | delegated | - | Core row GATE-7: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-8 | delegated | - | Core row GATE-8: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-9 | delegated | - | Core row GATE-9: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-10 | implemented | contract | `src/gate10-resolved.contract.test.tsx` against the vendored fixture (tree `542f57f5`), write key: `<Translate>` content blocks under `data-ls-resolved`, `data-langsys-resolved`, a bare attribute, and a marker two ancestors up are not registered; the `="false"` opt-out and an unmarked block are, and are stored. The same for the `<Translate>` single-token path, and for `<Phrase>` (control stored as `Phrase {m0o}control{m0c} text`). Negative control, the rule's own: a bare `t()` (`useT()`) in a component under a resolved ancestor **does** register, beside a `<Translate>` in the same subtree that does not, so a reader walking up from any call site would fail here. Every absence is asserted after its control is stored in the same world, so the double would have accepted it. The reading decision is the core's (Core row GATE-10: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE.); this binding's half is handing the core the live host inside the document, which is what the ancestor walk needs. Hint lane and identity-untouched clauses: the core row. Mutations: `<Translate>` host detached (`cloneNode`) → 2 red; `<Phrase>` host detached → 1 red. |
| CAT-1 | delegated | - | Core row CAT-1: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `CAT` → **0** hits; firing control `\bsTranslations\b` → **3**. |
| CAT-2 | delegated | - | Core row CAT-2: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `CAT` → **0** hits; firing control `\bsTranslations\b` → **3**. |
| CAT-3 | delegated | - | Core row CAT-3: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `CAT` → **0** hits; firing control `\bsTranslations\b` → **3**. |
| REG-1 | delegated | - | Core row REG-1: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `REG` → **0** hits; firing control `\buseEffect\b` → **8**. |
| REG-2 | delegated | - | Core row REG-2: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `REG` → **0** hits; firing control `\buseEffect\b` → **8**. |
| REG-3 | delegated | - | Core row REG-3: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `REG` → **0** hits; firing control `\buseEffect\b` → **8**. |
| REG-4 | delegated | - | Core row REG-4: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `REG` → **0** hits; firing control `\buseEffect\b` → **8**. |
| REG-5 | delegated | - | Core row REG-5: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `REG` → **0** hits; firing control `\buseEffect\b` → **8**. |
| REG-6 | delegated | - | Core row REG-6: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `REG` → **0** hits; firing control `\buseEffect\b` → **8**. |
| REG-7 | delegated | - | Core row REG-7: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `REG` → **0** hits; firing control `\buseEffect\b` → **8**. |
| REG-8 | delegated | - | Core row REG-8: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `REG` → **0** hits; firing control `\buseEffect\b` → **8**. |
| REG-9 | delegated | - | Core row REG-9: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `REG` → **0** hits; firing control `\buseEffect\b` → **8**. |
| REG-10 | partial | - | Core row REG-10: `partial` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. This binding inherits the core's missing half and authors none of the behaviour. Absence probe `REG` → **0** hits; firing control `\buseEffect\b` → **8**. |
| REG-11 | delegated | - | Core row REG-11: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `REG` → **0** hits; firing control `\buseEffect\b` → **8**. |
| REG-12 | delegated | - | Core row REG-12: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `REG` → **0** hits; firing control `\buseEffect\b` → **8**. |
| REG-13 | delegated | - | Core row REG-13: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `CAT` → **0** hits; firing control `\bsTranslations\b` → **3**. |
| HINT-1 | delegated | - | Core row HINT-1: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `HINT` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| HINT-2 | n/a (profile: server) | - | Profiles line is `server`; it names none of the profiles this file claims (browser, binding, all). |
| HINT-3 | delegated | - | Core row HINT-3: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `HINT` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| HINT-4 | delegated | - | Core row HINT-4: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `HINT` → **0** hits; firing control `\bcreateElement\b` → **6**. The persistent-layout shape, which does not re-enter the SDK on its own, re-enters through HINT-13's `useNotifyNavigation`, so the core's per-URL cap applies to it as to any other capture: `src/hint13-navigation.contract.test.tsx` stores a hint for the new page from a layout held as a stable element. |
| HINT-5 | delegated | - | Core row HINT-5: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `HINT` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| HINT-6 | delegated | - | Core row HINT-6: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `HINT` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| HINT-7 | delegated | - | Core row HINT-7: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `HINT` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| HINT-8 | delegated | - | Core row HINT-8: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `HINT` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| HINT-9 | delegated | - | Core row HINT-9: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `HINT` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| HINT-10 | delegated | - | Core row HINT-10: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `HINT` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| HINT-11 | delegated | - | Core row HINT-11: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `HINT` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| HINT-12 | delegated | - | Core row HINT-12: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `HINT` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| HINT-13 | implemented | contract | `useNotifyNavigation(location)` calls the core's `notifyNavigation()` (re-exported by reference) in an effect keyed on the router's location; the binding decides nothing else. `src/hint13-navigation.contract.test.tsx` against the vendored fixture (tree `542f57f5`), React Router `BrowserRouter`, a persistent layout held as a stable element that React does not re-render: navigating /a → /b with the hook stores a hint for /b; without it, /c → /d stores none for /d, while the hint for /c is stored in the same world, so the double would have accepted /d. Core row HINT-13: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Mutation: hook body emptied → 1 red, the with-hook case. |
| ICU-1 | delegated | - | Core row ICU-1: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `ICU` → **0** hits; firing control `\bTFunction\b` → **4**. |
| ICU-2 | delegated | - | Core row ICU-2: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `ICU` → **0** hits; firing control `\bTFunction\b` → **4**. |
| ICU-3 | delegated | - | Core row ICU-3: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `ICU` → **0** hits; firing control `\bTFunction\b` → **4**. |
| ICU-4 | delegated | - | Core row ICU-4: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `ICU` → **0** hits; firing control `\bTFunction\b` → **4**. |
| ICU-5 | delegated | - | Core row ICU-5: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `ICU` → **0** hits; firing control `\bTFunction\b` → **4**. |
| ICU-6 | delegated | - | Core row ICU-6: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `ICU` → **0** hits; firing control `\bTFunction\b` → **4**. |
| CID-1 | delegated | - | Core row CID-1: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `CID` → **0** hits; firing control `\bcustom_id\b` → **4**. |
| CID-2 | delegated | - | Core row CID-2: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `CID` → **0** hits; firing control `\bcustom_id\b` → **4**. |
| CID-3 | delegated | - | Core row CID-3: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `CID` → **0** hits; firing control `\bcustom_id\b` → **4**. |
| CID-4 | delegated | - | Core row CID-4: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `CID` → **0** hits; firing control `\bcustom_id\b` → **4**. |
| TOK-1 | delegated | - | Core row TOK-1: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `TOK` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| TOK-2 | delegated | - | Core row TOK-2: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `TOK` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| TOK-3 | delegated | - | Core row TOK-3: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `TOK` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| TOK-4 | delegated | - | Core row TOK-4: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `TOK` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| TOK-5 | delegated | - | Core row TOK-5: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `TOK` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| TOK-6 | partial | - | Core row TOK-6: `partial` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. This binding inherits the core's missing half and authors none of the behaviour. Absence probe `TOK` → **0** hits; firing control `\bcreateElement\b` → **6**. |
| MARK-1 | not implemented | - | The client route holds (Core row MARK-1: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE.): a mounted `<Translate custom_id="block-42">` is stamped `data-ls-contentblock="block-42"` by the core's class. The SSR route does not: `renderToString(<Translate custom_id="block-42">Hello world</Translate>)` → `<translate>Hello world</translate>`, measured against core `86871033`; the core's class runs only on client mount. CONF-1's every-path clause makes the SSR route decisive. Waits on the operator's ruling on where server-render capture lives (see Routed findings). |
| MARK-2 | partial | - | Core row MARK-2: `partial` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. This binding inherits the core's missing half and authors none of the behaviour. Absence probe `MARK` → **0** hits; firing control `PHRASE_MARKER_ATTR` → **2**. |
| MARK-3 | partial | - | Core row MARK-3: `partial` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. This binding inherits the core's missing half and authors none of the behaviour. Absence probe `MARK` → **0** hits; firing control `PHRASE_MARKER_ATTR` → **2**. |
| MARK-4 | delegated | - | Core row MARK-4: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `MARK` → **0** hits; firing control `PHRASE_MARKER_ATTR` → **2**. |
| SSR-1 | delegated | - | Core row SSR-1: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `SSR` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| SSR-2 | delegated | - | Core row SSR-2: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `SSR` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| SSR-3 | delegated | - | Core row SSR-3: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `SSR` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| SRV-1 | not implemented | - | Binds: this binding's hooks and components render under Next/Remix SSR. Measured with `renderToString` on `t('Pricing','UI')` against core `86871033`: unseeded → `<p>Pricing</p>`; after `LangsysApp.seedCatalog(<it>, 'it')` → `<p>Prezzi</p>`. The request locale is served only through the process-global seed, which is correct only while one request renders at a time. Not built, pending the operator's ruling. |
| SRV-2 | not implemented | - | Binds. **Cross-visitor leak, measured** against core `86871033`: request A seeds `it` and renders `<p>Prezzi</p>`; request B seeds `de` and renders `<p>Preise</p>`; request A's next render then serves `<p>Preise</p>` — the German visitor's catalog, served to the Italian one. The catalog is a module global shared by every request in the process, so concurrent requests interleave. Not built, pending the operator's ruling. |
| SRV-3 | not implemented | - | Binds. No after-flush collection path exists in this binding. Under SSR with the default `ssrTokenStrategy: 'client'`, the core collects nothing during a server render, so misses a server render meets are not collected at all. Because the catalog is process-global (SRV-2), a collection path built on it would attribute one request's misses against another's catalog. Not built, pending the operator's ruling. |
| SRV-4 | not implemented | - | Binds (binding half). The core's synchronous seed exists (Core row SRV-4: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE.; `seedCatalog(catalog, locale): void`, reachable here as `LangsysApp.seedCatalog` by reference). The hand-off this repo documents (`README-SSR.md`) passes `initialTranslations` to `init()` inside `useEffect`, which runs after hydration, not the synchronous seed before it; no hydration-mismatch control exists here. Absence probe `SNAP` (includes `seedCatalog`) → **0**; control → **2**. |
| SRV-5 | not implemented | - | Binds. No component child capture exists: `<Translate>` and `<Phrase>` hand their host to the core only on client mount, and nothing detects a `lazy`/`Suspense` fallback standing in for real content during a server render. Not built, pending the operator's ruling. |
| SRV-6 | n/a (architecture: this binding never chooses a locale; the app supplies UserLocaleStore) | - | The rule binds an SDK or binding "that chooses the request's locale". This binding reads no URL, cookie, session or header: the app decides the locale and passes it through `UserLocaleStore`, and `detectPreferredLocale` is the core's. Absence probe `SRV` (`Accept-Language`, cookies, request headers, `AsyncLocalStorage`, `Vary`) → **0**; control → **4**. Expires if this binding gains a locale-resolving server helper. |
| MSG-1 | delegated | - | Core row MSG-1: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `MSG` → **0** hits; firing control `\brenderServerMessage\b` → **3**. |
| MSG-2 | delegated | - | Core row MSG-2: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `MSG` → **0** hits; firing control `\brenderServerMessage\b` → **3**. |
| MSG-3 | n/a (profile: server) | - | Profiles line is `server`; it names none of the profiles this file claims (browser, binding, all). |
| MSG-4 | n/a (profile: server) | - | Profiles line is `server`; it names none of the profiles this file claims (browser, binding, all). |
| MSG-5 | implemented | n/a (pure) | `useRenderServerMessage()` returns the core's `renderServerMessage`, subscribed through `useT()`; the fallback decision is the core's (Core row MSG-5: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE.). `src/server-messages.test.tsx`: the vendored vectors (blob `c8125549`, pinned by a byte-exact hash row) — all 10 render rows, including no catalog, ICU plural at 1 and 3, and `message` present as a catalog key yet never looked up — each rendered out of a React component through the hook; a mounted list re-renders when the catalog arrives; a memoised child re-renders because the returned function changes identity with the catalog. Mutations: always `message` → 8 red; `message` as the key → 6 red; memo keyed on nothing → 1 red (the memoised child); `useT` subscription removed → 2 red. |
| MSG-6 | delegated | - | Core row MSG-6: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `MSG` → **0** hits; firing control `\brenderServerMessage\b` → **3**. |
| MSG-7 | n/a (profile: server) | - | Profiles line is `server`; it names none of the profiles this file claims (browser, binding, all). |
| MSG-8 | n/a (profile: server) | - | Profiles line is `server`; it names none of the profiles this file claims (browser, binding, all). |
| MSG-9 | n/a (profile: server) | - | Profiles line is `server`; it names none of the profiles this file claims (browser, binding, all). |
| MSG-10 | n/a (profile: server) | - | Profiles line is `server`; it names none of the profiles this file claims (browser, binding, all). |
| MSG-11 | n/a (profile: server) | - | Profiles line is `server`; it names none of the profiles this file claims (browser, binding, all). |
| MSG-12 | implemented | n/a (pure) | The binding's half: the page a failed form redirects to renders the entries it is handed as a prop. `src/msg12-inertia.test.tsx` mounts the real `@inertiajs/react` `App` and submits with its real `router` over HTTP to a local server standing in for the server SDK's half (flash on a failed POST, 302, shared as `langsys_errors` on the next page load, then dropped): the redirected page renders the translated template and the untranslated entry's `message`; the pages before the failure and after it render none. The graded property is what the page renders from a prop, with no server answer to assert on, hence `n/a (pure)`; the server half is langsys-php-laravel's (`InertiaHandoffTest`, against Inertia's real middleware). The M-mutations under MSG-5 that change rendered text (always `message`, `message` as key) red this row too. |
| MIG-1 | not implemented | - | Core row MIG-1: `not implemented` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. Nothing to delegate to yet; this binding authors none of it. Absence probe `MIG` → **0** hits; firing control `\buseT\b` → **3**. |
| MIG-2 | not implemented | - | Core row MIG-2: `not implemented` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. Nothing to delegate to yet; this binding authors none of it. Absence probe `MIG` → **0** hits; firing control `\buseT\b` → **3**. |
| MIG-3 | not implemented | - | Core row MIG-3: `not implemented` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. Nothing to delegate to yet; this binding authors none of it. Absence probe `MIG` → **0** hits; firing control `\buseT\b` → **3**. |
| MIG-4 | not implemented | - | Core row MIG-4: `not implemented` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. Nothing to delegate to yet; this binding authors none of it. Absence probe `MIG` → **0** hits; firing control `\buseT\b` → **3**. |
| MIG-5 | not implemented | - | Core row MIG-5: `not implemented` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. Nothing to delegate to yet; this binding authors none of it. Absence probe `MIG` → **0** hits; firing control `\buseT\b` → **3**. |
| MIG-6 | not implemented | - | Core row MIG-6: `not implemented` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. Nothing to delegate to yet; this binding authors none of it. Absence probe `MIG` → **0** hits; firing control `\buseT\b` → **3**. |
| MIG-7 | not implemented | - | Core row MIG-7: `not implemented` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. Nothing to delegate to yet; this binding authors none of it. Absence probe `MIG` → **0** hits; firing control `\buseT\b` → **3**. |
| MIG-8 | not implemented | - | Core row MIG-8: `not implemented` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. Nothing to delegate to yet; this binding authors none of it. Absence probe `MIG` → **0** hits; firing control `\buseT\b` → **3**. |
| MIG-9 | n/a (profile: server) | - | Profiles line is `server`; it names none of the profiles this file claims (browser, binding, all). |
| SNAP-1 | n/a (profile: server) | - | Profiles line is `server`; it names none of the profiles this file claims (browser, binding, all). |
| SNAP-2 | not implemented | - | Core row SNAP-2: `not implemented` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. There is no snapshot loader to wire; the binding half (loading it before first render) waits on the core's. Absence probe `SNAP` → **0** hits; firing control `\bLangsysApp\b` → **2**. |
| SNAP-3 | not implemented | - | Core row SNAP-3: `not implemented` (`-`) in langsys-js-typescript@86871033 CONFORMANCE. Nothing to delegate to yet; this binding authors none of it. Absence probe `SNAP` → **0** hits; firing control `\bLangsysApp\b` → **2**. |
| BIND-1 | implemented | n/a (pure) | Every binding-authored piece adapts shape or timing only. `useWriteEnabled` pins `getServerSnapshot`, adapting *when* React reads the core's value (`src/useWriteEnabled.test.tsx`, 7). `useNotifyNavigation` times the core's `notifyNavigation()` on a location change, which HINT-13 names as timing. `useRenderServerMessage` subscribes the core's `renderServerMessage` to `useT()`. The locale store passes `'en-US'` through verbatim (`src/locale-casing.test.ts`); normalizing would encode a core decision. `src/route-reentry.test.tsx` (3). |
| BIND-2 | implemented | n/a (pure) | Absence probe `GATE` → **0**, control → **4**. `src/useWriteEnabled.test.tsx` renders `undefined`, `false` and `true` as three distinct markup branches, so a collapse is visible in rendered output. |
| BIND-3 | implemented | n/a (pure) | Absence probes `REG` → **0** (no fetch, timers or batching) and `HINT` → **0** (no storage or URL capture); controls → **8** and **6**. The Inertia test's HTTP is the router's, driven by the test. |
| BIND-4 | implemented | n/a (pure) | `iLangsysInitConfig` is `Omit<iVanillaInitConfig, 'UserLocaleStore'> & { UserLocaleStore: Signal<string> }`: it narrows one existing key and adds none. `writeGrant` and `messagesCategory` are inherited, not declared. `useNotifyNavigation`'s argument is the router's location, wiring rather than configuration. `_dev_/enumerate-surface.mjs`: shape differs **0**. |
| BIND-5 | implemented | n/a (pure) | No lookup result is held anywhere. Absence probe `CACHE` → **0**, control → **2**. `_dev_/conformance-probe.py`'s memoization heuristic reports **2**, both `useRenderServerMessage` (the import and the call): it memoises the *function*, keyed on `t`, and the function calls the core on every render, so nothing it returns is reused. That the key is the catalog-change signal is proven by mutation: keyed on nothing, the memoised-child row goes red. |
| BIND-6 | implemented | n/a (pure) | `LangsysApp` **is** the core singleton, by reference. `src/surface.test.ts` derives the expected list from the core's `.d.ts` at test time; `_dev_/enumerate-surface.mjs` → public **23** (including `notifyNavigation`, `renderServerMessage`, `seedCatalog`), dropped **0**, shape **0**, not identical **0**, `--selftest` 5/5. Standalone exports (`notifyNavigation`, `resolveServerMessages`, `renderServerMessage`, `setWriteGrant`, the constants and types) are re-exported by reference. The one signal that needs adapting, `writeEnabled`, is not re-exported raw (`src/write-enabled-surface.test.ts`). |
| GRANT-1 | delegated | - | Core row GRANT-1: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GRANT` → **0** hits; firing control `\bsetWriteGrant\b` → **1**. |
| GRANT-2 | delegated | - | Core row GRANT-2: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GRANT` → **0** hits; firing control `\bsetWriteGrant\b` → **1**. |
| GRANT-3 | delegated | - | Core row GRANT-3: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GRANT` → **0** hits; firing control `\bsetWriteGrant\b` → **1**. |
| GRANT-4 | delegated | - | Core row GRANT-4: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `GRANT` → **0** hits; firing control `\bsetWriteGrant\b` → **1**. |
| CACHE-1 | delegated | - | Core row CACHE-1: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `CACHE` → **0** hits; firing control `\buseState\b` → **2**. |
| CACHE-2 | delegated | - | Core row CACHE-2: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `CACHE` → **0** hits; firing control `\buseState\b` → **2**. |
| OBS-1 | delegated | - | Core row OBS-1: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `OBS` → **0** hits; firing control `\buseEffect\b` → **8**. |
| WIRE-1 | delegated | - | Core row WIRE-1: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `WIRE` → **0** hits; firing control `\bLangsysAppAPI\b` → **1**. |
| WIRE-2 | delegated | - | Core row WIRE-2: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `WIRE` → **0** hits; firing control `\bLangsysAppAPI\b` → **1**. |
| WIRE-3 | delegated | - | Core row WIRE-3: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `WIRE` → **0** hits; firing control `\bLangsysAppAPI\b` → **1**. |
| WIRE-4 | delegated | - | Core row WIRE-4: `implemented` (`contract`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `WIRE` → **0** hits; firing control `\bLangsysAppAPI\b` → **1**. |
| WIRE-5 | delegated | - | Core row WIRE-5: `implemented` (`n/a (pure)`) in langsys-js-typescript@86871033 CONFORMANCE. Absence probe `WIRE` → **0** hits; firing control `\bLangsysAppAPI\b` → **1**. |
| CONF-1 | implemented | n/a (pure) | Artifact inspection of this file: the two `contract` rows (HINT-13, GATE-10) assert on the fixture's accepted state (`/__fixture/state`) and never on requests; every other row cites in-process behaviour with no server answer, a measured absence, or a named core row. The browser E2E (`npm run test:e2e`) is not cited as evidence. |
| CONF-2 | implemented | n/a (pure) | Meta-rule. Tiers recorded per row. `contract` evidence runs against `contract-fixture/`, vendored byte-exact from the core and cited by tree (`git rev-parse 86871033:contract-fixture` → `542f57f5ffcb9038db1b7411152b7e31b96cb269`). Absences meet the absence clause: each is asserted in a world where the same test stores its control, so the double would have accepted the withheld action. `n/a (pure)` rows are in-process, vector-backed, or artifact inspection with a positive control. |
| CONF-3 | implemented | n/a (pure) | Meta-rule. Every runtime rule this binding owns carries a recorded, re-appliable mutation, run in a separate git worktree against a clean core build (see Mutation evidence): HINT-13, GATE-10, MSG-5, MSG-12, BIND-1 (`getServerSnapshot` unpinned), BIND-5, BIND-6. Delegated rows' mutations are the core's. |

## Routed findings

Not graded against this binding; each has an owner.

- **SRV-1..5 and MARK-1's SSR route — operator.** Where server-render capture and request-scoped catalogs live is undecided. The six rows flip on that ruling; SRV-2's leak is the reason it matters.
- **MIG-1..8, SNAP-2, SNAP-3 — core.** Not built there. When the core lands a snapshot loader, SNAP-2's binding half is calling it before first render.
- **REG-10, TOK-6, MARK-2, MARK-3 — core.** Its rows name the missing half of each.
- **Release wave — dependency range.** `package.json` declares `langsys-js-typescript: "^0.6.5"` and the lockfile resolves the registry `0.6.5`; development runs through the symlink. In the release wave the range is bumped to the core version that ships this surface, and the suite re-run against the registry tarball — the symlinked `dist/` bypasses the `files` allowlist, the `exports` map and publint.

## Mutation evidence

Each run in a separate git worktree of this repo against the clean core build at `86871033`, then restored (0 dirty files).

| Row | Mutation | Result |
|---|---|---|
| HINT-13 | `useNotifyNavigation` body emptied | 1 red — the with-hook case |
| GATE-10 | `<Translate>` hands the core a detached clone of its host | 2 red — both `<Translate>` cases |
| GATE-10 | `<Phrase>` hands the core a detached clone of its host | 1 red — the `<Phrase>` case |
| MSG-5, MSG-12 | render always returns `entry.message` | 8 red, including the Inertia hand-off |
| MSG-5, MSG-12 | `entry.message` used as the lookup key | 6 red, including `message-is-never-the-key` and the hand-off |
| MSG-5, BIND-5 | render function memoised on nothing instead of `t` | 1 red — the memoised child |
| MSG-5 | `useT` subscription removed | 2 red — both re-render rows |
| BIND-1 | `getServerSnapshot` unpinned (`src/hooks.ts`) | 3 red — server render, hydration, SSR pending branch |
| BIND-6 | `refresh` hidden behind a proxy at the entry point | 3 of 6 red — reachability, singleton identity, identical references |
| BIND-6 | raw `writeEnabled` re-exported | 1 red — the absence row |

## Probes

Every `delegated` row's evidence comes from `_dev_/family-probes.py`, which strips comments, asserts it read at least six shipped source files (tests and `src/test-helpers/` excluded), and pairs each absence probe with a control that must fire in the same files. It exits 1 if any control reads zero, since a probe whose control is zero has read nothing. Current run: 18 families, 0 probe hits, every control non-zero.

`_dev_/enumerate-surface.mjs` classifies public members from the core's `.d.ts`, scoped to `LangsysAppClass`, and proves five detection properties with `--selftest` before any zero it prints is read. `_dev_/check-conformance.py` validates this file's format against the spec — one row per id, canonical statuses and tiers, delegated evidence naming a core row, probe and control — and catches seven seeded mutations with `--selftest`.

## Reproducing

```bash
git -C ~/Documents/dev/langsys2 fetch origin
git -C ~/Documents/dev/langsys2 rev-parse c1b16560d0a5191a736e63b7975d79e8625db8d3:docs/sdk-spec.mdx
cd node_modules/langsys-js-typescript && git rev-parse HEAD && git rev-parse HEAD:contract-fixture && cd -

npm run typecheck && npm test
python3 _dev_/family-probes.py && python3 _dev_/conformance-probe.py
git -C ~/Documents/dev/langsys2 show c1b16560d0a5191a736e63b7975d79e8625db8d3:docs/sdk-spec.mdx > /tmp/spec.mdx
python3 _dev_/check-conformance.py /tmp/spec.mdx && python3 _dev_/check-conformance.py /tmp/spec.mdx --selftest
npm run build && node _dev_/enumerate-surface.mjs && node _dev_/enumerate-surface.mjs --selftest
```
