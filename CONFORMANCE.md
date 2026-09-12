# CONFORMANCE — langsys-js-react

Conformance of this **binding** against the SDK Behaviour Spec.

| | |
|---|---|
| **Spec revision read** | langsys2 5cff03a1…, docs/sdk-spec.mdx blob 5c5c0723f88fb8e6b13f58876c7adca8b6b35691 |
| **Profiles** | browser, binding, all — derived: binding over langsys-js-typescript |
| specVersion | **8.0.1** (a correction to v8, unpublished) — 79 rules |
| Revision derived with | `git -C ~/Documents/dev/langsys2 rev-parse 5cff03a17751e7dae9dcf1af52a9454d027c9006:docs/sdk-spec.mdx` → `5c5c0723f88fb8e6b13f58876c7adca8b6b35691`, after `git fetch origin` at 2026-09-12T23:38:05Z. Re-derive on every write; never carry this row forward. |
| Repo state | branch `feature/838_write_gating_reland` |
| Core consumed | `langsys-js-typescript` `feature/838_write_key_gating_reland` @ `f58e0c43593108fc42b33524e634ac13c94fbbee` (declares `0.6.5`), via a gitignored `node_modules` symlink. Derived with `cd node_modules/langsys-js-typescript && git rev-parse HEAD`. The core moved **during** this lane: `4eac870` was derived at the start and the HEAD advanced one commit (`f58e0c4`, attribute-value whitespace in `translate.ts`) before this write. Re-checked at `f58e0c4`: the core's graded blob is unchanged and **0** of its CONFORMANCE statuses changed, so every delegated citation below still matches. The previous file cited `cfe8d40`, an ancestor of both. |
| Core's own grading | The core's CONFORMANCE is graded against blob **`8e2527b9`** (langsys `63df13c7`), not `5c5c0723`. Delegated rows below cite the core's status as the core records it, against its own revision. |
| Suite | **46 tests / 10 files**, green (`npm test`), typecheck clean. Transcribed from the run. |
## Tally

Computed from the status table below, not hand-counted.

| Status | Rows |
|---|---|
| `delegated` | 63 |
| `implemented` | 9 |
| `not implemented` | 6 |
| `n/a (profile: server)` | 1 |
| **total** | **79** |

**Not green, honestly.** Six rows are `not implemented`: SRV-1..5, which bind this binding whenever it renders inside a server request scope (Next, Remix), and MARK-1, whose SSR route carries no identity. All six wait on the operator's open ruling on where server-render capture and request-scoped catalogs live — the JS Server adapters or the bindings. Per dispatch, no SRV behaviour is built here until that ruling.
## Scope

A **binding**: it inherits the browser core's profile and adds nothing of its own, so most rules are the core's to satisfy. Rows therefore take one of three shapes:

- **`implemented` · `n/a (pure)`** — behaviour this binding owns, proven in-process (jsdom, no server) or by artifact inspection with a positive control. Per the fleet tier addendum these are `n/a (pure)`, not `mock`, so they are not capped at `provisional`.
- **`delegated` · `-`** — the core owns it. Evidence names the core's row and an absence probe proving this binding does not participate, with the probe's firing control.
- **`not implemented` · `-`** — the rule binds this binding and the behaviour is absent, measured.

## Status

| Rule | Status | Tier | Evidence |
|---|---|---|---|
| GATE-1 | delegated | - | Core row GATE-1: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-2 | delegated | - | Core row GATE-2: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-3 | delegated | - | Core row GATE-3: `provisional (no test)` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-4 | delegated | - | Core row GATE-4: `provisional (no test)` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-5 | delegated | - | Core row GATE-5: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-6 | delegated | - | Core row GATE-6: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-7 | delegated | - | Core row GATE-7: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| GATE-8 | delegated | - | Core row GATE-8: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `GATE` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| CAT-1 | delegated | - | Core row CAT-1: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `CAT` → **0** hits; firing control `sTranslations` → **3**. |
| CAT-2 | delegated | - | Core row CAT-2: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `CAT` → **0** hits; firing control `sTranslations` → **3**. |
| CAT-3 | delegated | - | Core row CAT-3: `provisional (no test)` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `CAT` → **0** hits; firing control `sTranslations` → **3**. |
| REG-1 | delegated | - | Core row REG-1: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `REG` → **0** hits; firing control `useEffect` → **6**. |
| REG-2 | delegated | - | Core row REG-2: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `REG` → **0** hits; firing control `useEffect` → **6**. |
| REG-3 | delegated | - | Core row REG-3: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `REG` → **0** hits; firing control `useEffect` → **6**. |
| REG-4 | delegated | - | Core row REG-4: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `REG` → **0** hits; firing control `useEffect` → **6**. |
| REG-5 | delegated | - | Core row REG-5: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `REG` → **0** hits; firing control `useEffect` → **6**. |
| REG-6 | delegated | - | Core row REG-6: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `REG` → **0** hits; firing control `useEffect` → **6**. |
| REG-7 | delegated | - | Core row REG-7: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `REG` → **0** hits; firing control `useEffect` → **6**. |
| REG-8 | delegated | - | Core row REG-8: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `REG` → **0** hits; firing control `useEffect` → **6**. |
| REG-9 | delegated | - | Core row REG-9: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `REG` → **0** hits; firing control `useEffect` → **6**. |
| REG-10 | delegated | - | Core row REG-10: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `REG` → **0** hits; firing control `useEffect` → **6**. |
| REG-11 | delegated | - | Core row REG-11: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `REG` → **0** hits; firing control `useEffect` → **6**. |
| REG-12 | delegated | - | Core row REG-12: `provisional (no test)` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `REG` → **0** hits; firing control `useEffect` → **6**. |
| HINT-1 | delegated | - | Core row HINT-1: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `HINT` → **0** hits; firing control `createElement` → **6**. |
| HINT-2 | n/a (profile: server) | - | Profiles line is `server` only; it excludes every profile this file claims (browser, binding, all). Expires if that line gains a browser or binding clause. |
| HINT-3 | delegated | - | Core row HINT-3: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `HINT` → **0** hits; firing control `createElement` → **6**. |
| HINT-4 | delegated | - | Core row HINT-4: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `HINT` → **0** hits; firing control `createElement` → **6**. |
| HINT-5 | delegated | - | Core row HINT-5: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `HINT` → **0** hits; firing control `createElement` → **6**. |
| HINT-6 | delegated | - | Core row HINT-6: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `HINT` → **0** hits; firing control `createElement` → **6**. |
| HINT-7 | delegated | - | Core row HINT-7: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `HINT` → **0** hits; firing control `createElement` → **6**. |
| HINT-8 | delegated | - | Core row HINT-8: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `HINT` → **0** hits; firing control `createElement` → **6**. |
| HINT-9 | delegated | - | Core row HINT-9: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `HINT` → **0** hits; firing control `createElement` → **6**. |
| HINT-10 | delegated | - | Core row HINT-10: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `HINT` → **0** hits; firing control `createElement` → **6**. |
| HINT-11 | delegated | - | Core row HINT-11: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `HINT` → **0** hits; firing control `createElement` → **6**. |
| HINT-12 | delegated | - | Core row HINT-12: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `HINT` → **0** hits; firing control `createElement` → **6**. |
| ICU-1 | delegated | - | Core row ICU-1: `corroborated (cross-implementation)` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `ICU` → **0** hits; firing control `TFunction` → **4**. |
| ICU-2 | delegated | - | Core row ICU-2: `corroborated (cross-implementation)` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `ICU` → **0** hits; firing control `TFunction` → **4**. |
| ICU-3 | delegated | - | Core row ICU-3: `corroborated (cross-implementation)` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `ICU` → **0** hits; firing control `TFunction` → **4**. |
| ICU-4 | delegated | - | Core row ICU-4: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `ICU` → **0** hits; firing control `TFunction` → **4**. |
| ICU-5 | delegated | - | Core row ICU-5: `corroborated (cross-implementation)` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `ICU` → **0** hits; firing control `TFunction` → **4**. |
| CID-1 | delegated | - | Core row CID-1: `corroborated (cross-implementation)` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `CID` → **0** hits; firing control `custom_id` → **4**. |
| CID-2 | delegated | - | Core row CID-2: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `CID` → **0** hits; firing control `custom_id` → **4**. |
| CID-3 | delegated | - | Core row CID-3: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `CID` → **0** hits; firing control `custom_id` → **4**. |
| CID-4 | delegated | - | Core row CID-4: `corroborated (cross-implementation)` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `CID` → **0** hits; firing control `custom_id` → **4**. |
| TOK-1 | delegated | - | Core row TOK-1: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `TOK` → **0** hits; firing control `createElement` → **6**. |
| TOK-2 | delegated | - | Core row TOK-2: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `TOK` → **0** hits; firing control `createElement` → **6**. **HELD (strip ruling)** on the core's C0-control handling; this binding delegates, so the row is `delegated` regardless of that ruling. |
| TOK-3 | delegated | - | Core row TOK-3: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `TOK` → **0** hits; firing control `createElement` → **6**. |
| TOK-4 | delegated | - | Core row TOK-4: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `TOK` → **0** hits; firing control `createElement` → **6**. |
| TOK-5 | delegated | - | Core row TOK-5: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `TOK` → **0** hits; firing control `createElement` → **6**. |
| MARK-1 | not implemented | - | Holds on the client route and not on the SSR route; CONF-1's every-path clause makes the SSR route decisive. Measured: client-mounted `<Translate custom_id="block-42">` → `<translate data-ls-contentblock="block-42">` (the core's class writes it on mount); the same component under `renderToString` → `<translate>Hello there</translate>`, no identity in the served bytes. `<Phrase>` carries `data-ls-phrase` on both routes. A derived `custom_id` exists only after the core tokenizes the subtree, so emitting it server-side means server-side tokenization — which BIND-1 forbids this binding reimplementing, and which sits inside the open SRV ruling. Becomes `delegated` if that ruling assigns server-render identity to the JS Server adapters. Not built, per dispatch. |
| MARK-2 | delegated | - | Core row MARK-2: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `MARK2` → **0** hits; firing control `PHRASE_MARKER_ATTR` → **2**. |
| SSR-1 | delegated | - | Core row SSR-1: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `SSR` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| SSR-2 | delegated | - | Core row SSR-2: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `SSR` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| SSR-3 | delegated | - | Core row SSR-3: `provisional (no test)` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `SSR` → **0** hits; firing control `useSyncExternalStore` → **4**. |
| SRV-1 | not implemented | - | Binds: this binding's hooks and components render under Next/Remix SSR. Measured with `renderToString` on `t('Pricing','UI')`: unseeded → `<p>Pricing</p>`; module global seeded for `it` → `<p>Prezzi</p>`. So the request locale is served only via a **process-global** seed, which is correct solely under zero concurrency — see SRV-2. No request-scoped path exists. Not built, per dispatch. |
| SRV-2 | not implemented | - | Binds. **Measured failing:** after seeding `it` (`Prezzi`), a second render seeding `de` into the same `sTranslations` module global served `<p>Preise</p>` — the second request overwrote the first. The catalog is process-global, so concurrent requests interleave. Not built, per dispatch. |
| SRV-3 | not implemented | - | Binds. No after-flush collection path exists in this binding. Under SSR with the default `ssrTokenStrategy: 'client'`, the core's `shouldQueueForWrite()` returns `false`, so misses discovered during a server render are not collected at all. Not built, per dispatch. |
| SRV-4 | not implemented | - | Binds (binding half). The core's synchronous seed exists: `seedCatalog(catalog: iCategories, locale: string): void` on `LangsysAppClass`, reachable here by reference (`_dev_/enumerate-surface.mjs`: public 21, includes `seedCatalog`). But the hand-off this repo documents (`README-SSR.md`) passes `initialTranslations` through async `init()` inside `useEffect`, which runs **after** the first client render, so that render is not byte-identical to the served HTML. Not rewired, per dispatch — the fix is small and waits on the SRV ruling. |
| SRV-5 | not implemented | - | Binds. No component child capture exists in this binding: `<Translate>` and `<Phrase>` hand their host to the core only on client mount, and nothing detects a `lazy`/`Suspense` fallback standing in for real content during a server render. Not built, per dispatch. |
| BIND-1 | implemented | n/a (pure) | `src/route-reentry.test.tsx` (3), `src/locale-casing.test.ts` (store passes `'en-US'` through verbatim; normalizing would encode a core decision), `src/useWriteEnabled.test.tsx` (7). The one binding-authored decision, `useWriteEnabled`'s pinned `getServerSnapshot`, adapts *when* React reads the value, never *what* it is. Mutation: unpinning it turns 3 named assertions red. |
| BIND-2 | implemented | n/a (pure) | Absence probe `GATE` → **0**, control → **4**. `src/useWriteEnabled.test.tsx` renders `undefined`, `false` and `true` as three distinct markup branches, so a collapse is visible in rendered output, not only in a hook return. |
| BIND-3 | implemented | n/a (pure) | Absence probes `REG` → **0** (no fetch, timers or batching) and `HINT` → **0** (no storage or URL capture); controls → **6** and **6**. |
| BIND-4 | implemented | n/a (pure) | `iLangsysInitConfig` is `Omit<iVanillaInitConfig, 'UserLocaleStore'> & { UserLocaleStore: Signal<string> }` — it narrows one existing key and adds none. `writeGrant` is inherited, not declared. `_dev_/enumerate-surface.mjs`: shape-differs **0**. |
| BIND-5 | implemented | n/a (pure) | Absence probe `CACHE` → **0**, control → **2**; `_dev_/conformance-probe.py` memoization probe → **0** over `src/` and `example/`. No cache exists, so present-with-null cannot collapse into absent. (The stable-element route re-entry gap previously graded here is not a caching behaviour — see Routed findings.) |
| BIND-6 | implemented | n/a (pure) | `LangsysApp` **is** the core singleton by reference. `src/surface.test.ts` (6) derives the expected list from the `.d.ts` public surface at test time; `_dev_/enumerate-surface.mjs` → public **21**, dropped **0**, shape **0**, not-identical **0**, `--selftest` 5/5. `src/write-enabled-surface.test.ts` (4) pins the deliberate absence of the raw `writeEnabled` re-export. **Destructuring, measured by calling:** `const { t } = LangsysApp` is callable (getter returning a closure); destructured prototype methods throw `TypeError` on the core and here identically — by-reference preserves the core's semantics exactly. Mutations: hiding a public member → 3 of 6 red; re-exporting raw `writeEnabled` → the absence row red. BIND-6 v2 ruling text not yet received; graded against the 8.0.1 wording. |
| GRANT-1 | delegated | - | Core row GRANT-1: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `GRANT` → **0** hits; firing control `setWriteGrant` → **1**. |
| GRANT-2 | delegated | - | Core row GRANT-2: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `GRANT` → **0** hits; firing control `setWriteGrant` → **1**. |
| GRANT-3 | delegated | - | Core row GRANT-3: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `GRANT` → **0** hits; firing control `setWriteGrant` → **1**. |
| GRANT-4 | delegated | - | Core row GRANT-4: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `GRANT` → **0** hits; firing control `setWriteGrant` → **1**. |
| CACHE-1 | delegated | - | Core row CACHE-1: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `CACHE` → **0** hits; firing control `useState` → **2**. |
| OBS-1 | delegated | - | Core row OBS-1: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `OBS` → **0** hits; firing control `useEffect` → **6**. |
| WIRE-1 | delegated | - | Core row WIRE-1: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `WIRE` → **0** hits; firing control `LangsysAppAPI` → **1**. |
| WIRE-2 | delegated | - | Core row WIRE-2: `provisional` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `WIRE` → **0** hits; firing control `LangsysAppAPI` → **1**. |
| WIRE-3 | delegated | - | Core row WIRE-3: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `WIRE` → **0** hits; firing control `LangsysAppAPI` → **1**. |
| WIRE-4 | delegated | - | Core row WIRE-4: `provisional (no test)` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `WIRE` → **0** hits; firing control `LangsysAppAPI` → **1**. |
| WIRE-5 | delegated | - | Core row WIRE-5: `implemented` in langsys-js-typescript@f58e0c4 CONFORMANCE (graded there against blob `8e2527b9`, not `5c5c0723`). Absence probe `WIRE` → **0** hits; firing control `LangsysAppAPI` → **1**. |
| CONF-1 | implemented | n/a (pure) | Artifact inspection of this file: every row cites either in-process behaviour with no server involved, or a named core row. No row relies on an outgoing payload, spy or mock call as evidence for a server-dependent property. The browser E2E (`npm run test:e2e`) asserts 2xx acceptance and is not cited as row evidence. SSR identity is recorded per route (MARK-1), per the every-path clause. |
| CONF-2 | implemented | n/a (pure) | Meta-rule. Tiers recorded per row under the fleet tier addendum: `n/a (pure)` for in-process and artifact-inspection evidence, `-` for delegated and not-implemented rows. No row claims `live` or `contract`. |
| CONF-3 | implemented | n/a (pure) | Meta-rule. Runtime claims proven by recorded mutation — see Mutation evidence: snapshot unpin (3 red), public member hidden (3 of 6 red), raw re-export restored (absence row red), destructuring claim asserted (red, `TypeError`), plus the enumerator's 5 self-checks and a sabotaged self-check exiting 2. |

## Corrections

Recorded as corrections, not silent edits. This revision's:

- **GATE-2 was mis-mapped, `provisional` → `delegated`.** GATE-2 governs collecting always and choosing the lane at the send site, holding on unknown — core behaviour. The v7 row cited `useWriteEnabled`'s rendered tri-state, which is not what the rule governs.
- **BIND-5 was mis-mapped, `partial` → `implemented`.** BIND-5 is only "a binding does not cache lookup results". The v7 row hung the stable-element route re-entry gap on it; that gap is discovery completeness, not caching, and is now under Routed findings.
- **CID-1..4 carried two rows with conflicting grades** — a `CID-*` wildcard graded `provisional` and a `CID-1..4` row graded `delegated`. Now one row per id, `delegated`.
- **CACHE-1, `n/a (architecture)` → `delegated`.** The core owns caching and rows it implemented; this binding holds no cache (probe `CACHE` → 0).
- **Destructuring.** `src/index.ts` claimed by-reference export means "destructuring keeps working", and `src/surface.test.ts` carried a row named "survives destructuring" that checked only `typeof` and identity. It never called the function, so it stayed green while the destructured method threw `TypeError`. Red-first: the existing row passed (1 passed, exit 0); asserting the docs' claim failed (exit 1, `TypeError`); the truthful row now calls both and passes. Destructured `t` works; destructured prototype methods throw, on the core and here identically.
- **"Peer dependency".** `src/index.ts` and this file called `langsys-js-typescript` a peer dependency. It is a regular `dependencies` entry (`^0.6.5`), installed transitively.
- **"SSR-safe".** `src/index.ts` said the raw `t` / `currentlyLoadedLocale` / `sTranslations` signals are SSR-safe because `initialTranslations` seeds them before the server render. The documented pattern runs `init()` in `useEffect`, which never runs on the server, and the signals are process-global (SRV-2, measured). Rewritten to what is true: they *can* be seeded for a server render via the core's synchronous `seedCatalog()`, with the concurrency caveat stated.
- **Core SHA, twice.** The previous file cited `cfe8d40`, an ancestor of the HEAD actually built against. This lane re-derived `4eac870` — and the core then advanced to `f58e0c4` mid-lane, caught only because the surface enumerator prints the SHA it actually resolved. Re-derived again at write time; delegated core statuses re-checked, 0 changed.

Earlier corrections, carried from the v7 file: the five-site `canonicalizeLocale` casing defect (`3e55389`); removal of the raw `writeEnabled` re-export (`3e55389`); the stable-element re-entry measurement and its adverse result (`c00e226`); the retraction of "the wrapper dropped five core methods" — all five are `private` in the core's `.d.ts`, public dropped was 0 (`edde9b9`); and the class-scoping of the private-member scan (`80593d7`).

## Routed findings

Not graded against this binding; each has an owner.

- **Stable-element route re-entry — core-side.** A layout held as a stable element reference (module-level, or `children` pass-through) does not re-enter `t()` on a client-side route change: React bails out on an identical element reference. Measured layout 0, page 1 (`src/route-reentry.test.tsx`). Since the core re-records discovery per URL, phrases rendered only by that layout are never credited to the new URL. Not fixable here without overriding React's bail-out, which is the binding implementing behaviour rather than delegating it (BIND-1). In the TS design queue.
- **SRV-1..5 and MARK-1's SSR route — operator.** Where server-render capture and request-scoped catalogs live is undecided. The six rows flip on that ruling.
- **Release wave — dependency range.** `package.json` declares `langsys-js-typescript: "^0.6.5"` and the lockfile resolves the **pre-838 registry `0.6.5`**; development runs through the symlink. The core's `package.json` still reads `0.6.5` while its changelog intends `0.7.0`. In the release wave this range MUST be bumped to the core version that actually ships 838, and both suites re-run against the registry tarball — the symlinked `dist/` bypasses the `files` allowlist, the `exports` map and publint.

## Mutation evidence

| Mutation | Result | Restored |
|---|---|---|
| `getServerSnapshot` unpinned (`src/hooks.ts`) | 3 named assertions red | 7/7 green |
| Public member hidden behind the entry point | 3 of 6 red — reachability, singleton identity, identical references | 6/6 green |
| Private member hidden instead | 1 of 6 red — identity only, correctly | 6/6 green |
| Raw `writeEnabled` re-exported | the absence row red; both positive controls green | 4/4 green |
| Destructured method asserted callable (the docs' former claim) | red, `TypeError` | replaced by the truthful row, green |
| Enumerator self-check sabotaged | exit 2 | 5/5 green |

## Probes

Every `delegated` row's evidence comes from `_dev_/family-probes.py`, which strips comments, asserts it read at least six source files, and pairs each absence probe with a control that must fire in the same files. It exits 1 if any control reads zero — a probe whose control is zero has read nothing, and this repo has shipped that failure once. Current run: 13 families, 0 probe hits, every control non-zero.

`_dev_/enumerate-surface.mjs` classifies public members from the core's `.d.ts`, scoped to `LangsysAppClass`, and proves five detection properties with `--selftest` before any zero it prints is read.

## Reproducing

```bash
git -C ~/Documents/dev/langsys2 fetch origin
git -C ~/Documents/dev/langsys2 rev-parse 5cff03a17751e7dae9dcf1af52a9454d027c9006:docs/sdk-spec.mdx
cd node_modules/langsys-js-typescript && git rev-parse HEAD && cd -

npm run typecheck && npm test
python3 _dev_/family-probes.py
npm run build && node _dev_/enumerate-surface.mjs && node _dev_/enumerate-surface.mjs --selftest
```
