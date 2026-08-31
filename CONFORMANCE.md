# CONFORMANCE — langsys-js-react

Conformance of this **binding** against the SDK Behaviour Spec.

| | |
|---|---|
| Spec version | **7** (`specVersion: 7`) |
| Spec text read | `docs/sdk-spec.mdx` blob `06ae105a0a1f7b5245ec32929f0b3885c63f0336`, from `langsys2` `origin/main` @ `7bee50d63e7889696b037aec313578d981c7354a` |
| Read at | 2026-08-31T20:59:40Z |
| Repo state | branch `feature/838_write_gating_reland` |
| Suite | **34 tests / 8 files**, all passing (includes a 3-test upstream precondition and a 4-test surface-absence pin) |
| Evidence grade of the suite | **`mock`** — jsdom, no network, core resolved through a local symlink |
| Core consumed | `langsys-js-typescript` `feature/838_write_key_gating_reland` @ `82678b6` (declares `0.6.5`), via a gitignored `node_modules` symlink — **not** the published `0.6.5`. Resolved from the link at write time (`cd node_modules/langsys-js-typescript && git rev-parse HEAD`), not quoted from prior notes — see [Corrections](#corrections). |
| Profiles | `browser` · `binding` · `all` |
| Rules applicable | **66 of 67** — only [HINT-2](#hint-2) is excluded (`profile: server`) |
| Graded rows | **21** — computed from this file's tables, not hand-counted |
| Grade summary | `provisional` 9 · `delegated` 9 · `partial` 1 · `n/a (architecture)` 1 · `n/a (profile: server)` 1 · `implemented` 0 · `open` 0 |

> **Nothing here is graded `implemented`, and that is correct.** CONF-2 caps a
> suite whose evidence is `mock` at `provisional`. This suite is jsdom with the
> network absent; the browser E2E that would raise the ceiling runs against a
> live local stack and is not part of `npm test`. A binding with no green ticks
> is the evidence model working.

## Scope — why this file is short

This is a **binding**. It inherits the browser core's profile and adds nothing of
its own, so most of the spec is not its to satisfy: the core owns registration,
discovery, interpolation, identity and the wire format outright. Grading those
rules here would produce rows that cannot fail — the green-proving-nothing
failure CONF-1 and CONF-3 exist to stop.

So this file carries three things:

1. **BIND-1..6** — the binding backbone. Every row, no exceptions.
2. **Rules this binding could _interfere_ with** — where React code sits between
   the app and a core decision. Interference is the only way a binding fails a
   behavioural rule.
3. **One delegation block** for the families the core owns, each with a probe
   that could have found participation and did not.

A rule absent from this file is absent because this binding cannot reach it.
Where that judgement is non-obvious the row says so rather than omitting it.

## Grades

| Grade | Means |
|---|---|
| `implemented` | Behaviour present, evidence `live` or `contract`. **Unreachable in this file** — CONF-2. |
| `provisional` | Behaviour present, evidence `mock`. The honest ceiling until a live fixture lands. |
| `partial` | Some of the rule is met; the row names what is not. |
| `delegated` | The core owns it. The row names the probe proving this binding does not participate, **with the probe's non-zero control count** — a probe reading no files reports absence for everything. |
| `n/a (profile)` | Cannot apply to a browser binding. Expires if the profile line changes. |
| `n/a (architecture)` | Applies to the profile, but this binding has no code path that reaches it. Expires if that path is added. |
| `open` | Undecided. Recorded as undecided rather than graded against a choice nobody made. |

The two `n/a` kinds are deliberately distinct. A profile `n/a` expires when the
spec's profile line moves; an architecture `n/a` expires when *this repo* grows
the code path. Collapsing them hides which of the two is watching.

## 1 — Binding rules (BIND-1..6)

| Rule | Grade | Evidence |
|---|---|---|
| BIND-1 — adapt shape and timing, never meaning | `provisional` | `src/route-reentry.test.tsx` (2 tests), `src/locale-casing.test.ts:48` — the locale store passes `'en-US'` through verbatim rather than pre-normalizing, because normalizing would encode a core decision. The one binding-authored decision, `useWriteEnabled`'s pinned `getServerSnapshot`, adapts *when React may read* the value and never *what it is*. |
| BIND-2 — never branch on server-computed capability | `provisional` | Probe `key_type\|keyType` over `src/` → **0** (control: `useSyncExternalStore` → 4). `useWriteEnabled` returns the server's tri-state undefaulted; `src/useWriteEnabled.test.tsx` asserts `undefined`, `false` and `true` render as three distinct branches. |
| BIND-3 — no network behaviour of its own | `provisional` | Probes over `src/`: `fetch(\|XMLHttpRequest\|axios` → **0**; `setTimeout\|setInterval\|queueMicrotask` → **0**; `sessionStorage\|localStorage` → **0**. Controls non-zero (see [Probes](#probes)). |
| BIND-4 — no config the core does not define | `provisional` | `iLangsysInitConfig` is `Omit<iVanillaInitConfig, 'UserLocaleStore'> & { UserLocaleStore: Signal<string> }` (`src/index.ts`). The single divergence narrows an existing key's type; it adds none. `writeGrant` is inherited, not declared here. |
| BIND-5 — no caching of lookups; presence must survive any cache | `partial` | Cache half: `provisional`. Probe `useMemo\|useCallback\|React.memo\|memo(` over `src/` **and** `example/` → **0**; no cache exists, so absent≠present-but-null cannot be lost here. **Re-entry half: a finding, see [Route re-entry](#route-re-entry-measurement).** A stable-element layout does not re-enter `t()` on navigation, which is the persistent-layout discovery gap; not fixable in this binding. |
| BIND-6 — wrap the narrowest surface | `provisional` | `src/write-enabled-surface.test.ts` (4 tests) pins the deliberate absence of the raw `writeEnabled` re-export, with two positive controls. Reasoning at the export site, `src/index.ts:49-65`. |

## 2 — Rules this binding could interfere with

| Rule | Grade | Evidence |
|---|---|---|
| GATE-2 — surface capability without defaulting | `provisional` | `src/useWriteEnabled.test.tsx` — three mutually exclusive rendered branches; `undefined` must not render the read-only branch. |
| SSR-1 — under `client`, do not collect server-side | `provisional` | Not this binding's behaviour, but its docs assert it: `README.md` and `README-SSR.md` describe `ssrTokenStrategy` as inert in both documented Next setups, re-verified against the core's `shouldQueueForWrite()` returning `false` for SSR + `client`. |
| SSR-2 / SSR-3 | `delegated` | Core-owned. This binding neither sets nor degrades the strategy; probe: `ssrTokenStrategy` in `src/` → **0** (control: `useSyncExternalStore` → 4). Documented only. |
| WIRE-3 — lowercase locale on the wire and internally | `provisional` | `src/locale-casing.test.ts` (6 tests), expectations written as literals rather than recomputed through the core's own helper. **Fixed a live defect here — see [Corrections](#corrections).** |
| CID-* (marker identity) | `provisional` | `src/markers.test.ts` (4 tests): rendered output must equal what the core *currently* exports and be a member of `PHRASE_MARKER_ATTRS`. `src/components.test.ts` keeps literal assertions as the independent verifier. |
| CACHE-1 | `n/a (architecture)` | This binding holds no cache of any kind (BIND-5 probe → 0). Expires the moment a cache is introduced here. |

## 3 — Delegation block: families the core owns

Each row names a probe that **could** have found this binding participating, and
did not. Probe counts are comment-stripped; the filter is published under
[Probes](#probes). Control counts are non-zero, so a zero is an absence rather
than a probe that read nothing.

| Family | Grade | Probe (this binding does not participate) |
|---|---|---|
| GATE-1, GATE-3..8 | `delegated` | `key_type\|keyType` → **0**; no capability decision is authored here. Control: `useSyncExternalStore` → 4. |
| REG-1..12 | `delegated` | `fetch(\|XMLHttpRequest\|axios` → **0**; `setTimeout\|setInterval\|queueMicrotask` → **0**. Registration, batching and retry are entirely core-side. |
| CAT-1..3 | `delegated` | `new Map(\|cache` → **0**. No catalog is held or keyed here. |
| HINT-1, HINT-3..12 | `delegated` | `sessionStorage\|localStorage` → **0**; no URL normalization or hint scheduling is authored here. |
| ICU-1..5 | `delegated` | No interpolation code: `interpolate\|isICU` → **0** in `src/`. `t()` is returned by the core untouched. |
| CID-1..4 | `delegated` | `generateCustomId\|md5` → **0**; identity is computed core-side. Marker *transport* is covered in §2. |
| GRANT-1..4 | `delegated` | `setWriteGrant` is a one-line delegation (`src/index.ts`) returning the core's promise; no grant is minted, cached or validated here. |
| OBS-1, WIRE-1/2/4/5 | `delegated` | No request is constructed here; probe as REG. |
| HINT-2 | `n/a (profile: server)` | A browser binding cannot fail it. Expires if the profile line changes. |

## Route re-entry measurement

BIND-5's hazard is that a memo keyed on `t` suppresses discovery on a new URL,
because the core re-records discovery **per URL** before its own dedup while
`TFunction` identity does **not** change on a route change.

No memo layer exists here (`src/` + `example/`, comment-stripped → 0), so the
question is React's own re-render semantics. **They differ by shape, and only
one shape is favourable** (`src/route-reentry.test.tsx`, 3 tests):

| Layout shape | Re-enters `t()` on route change? | Measured |
|---|---|---|
| Element **recreated** each render (`createElement(Layout)` inside the parent) | yes | layout 2 of 2 |
| Element held as a **stable reference** (module-level, or `children` pass-through) | **no** | layout **0**, page 1 |

`TFunction` identity is stable across the change, asserted directly — so the
memo hazard is real *and* React adds a second path to the same outcome that
needs no memo at all.

**The stable-element result is a finding, not a pass.** React bails out on an
identical element reference before the component body runs, so phrases rendered
only by a persistent layout are never re-offered on the new URL and the new URL
is never credited with them. That is the persistent-layout discovery gap, and
this is the shape real routers and `children`-pass-through layouts produce —
which makes it the common case, not the corner.

It is **not fixable inside this binding**: there is no memo to correct, and
forcing a re-render would mean overriding React's own bail-out — this binding
implementing behaviour rather than delegating it, which BIND-1 forbids. Routed
core-side, where a per-URL re-offer that does not depend on re-render would
close it for every framework at once. React is the fourth binding to confirm it.

Both shapes are pinned. If React's bail-out changes, or the core grows a
re-offer path, the adverse row goes red and the finding is stale.

**Correction:** an earlier revision of this file recorded "2 of 2 components
re-enter, persistent layout included" and generalised it to persistent layouts
in general. The test it cited built its layout element *inside* the parent's
render, so it measured the recreated shape while its comment claimed the stable
one — the favourable answer to a question the code did not ask. Caught in
review; the adverse shape is now measured and recorded, per the rule that an
adverse answer is worth more recorded than avoided.

## Mutation evidence

Every runtime claim below was verified by breaking it and watching named
assertions fail — CONF-3: runtime rules are proven by mutation, not by a passing
test.

| Mutation | Assertions that went red | Restored |
|---|---|---|
| `getServerSnapshot` unpinned: `writeEnabledServerSnapshot` → `writeEnabled.get` (`src/hooks.ts:90`) | **3** — `reports undefined during server rendering even once the signal holds a value`; `hydrates without mismatch when authorization resolves before hydration`; `SSR output renders the pending branch even when the signal already holds a value` | 7/7 green |
| Raw `writeEnabled` re-export restored to `src/index.ts:47` | **1** — `does not re-export the raw signal`. Both positive controls stayed green, confirming the row failed for the right reason. | 4/4 green |

## Corrections

Recorded as corrections rather than silently fixed.

**WIRE-3 — five documentation sites asserted the opposite of the core's
behaviour.** `canonicalizeLocale` **lowercases**: `'en-US'` → `'en-us'`. This
repo documented the reverse and instructed consumers to compare against
`'en-US'` — a comparison that can never match, so anyone following the README
wrote a locale check that silently never fired. Corrected at `README.md` (×2),
`CLAUDE.md`, `src/adapters.ts` and `src/index.test.ts`, against measured output.
Stale-phrase sweep, scoped to exclude this file — which quotes both needles in
order to document them, and so self-matches if swept naively:

```bash
grep -rF "'en-us' → 'en-US'" --exclude=CONFORMANCE.md .   # expected 0, actual 0
grep -rF "canonical form (\`'en-US'\`)" --exclude=CONFORMANCE.md .   # expected 0, actual 0
```

The unscoped form returns 1 for the second needle, from the sentence above. An
earlier revision recorded "actual 0" without the exclusion, which was not
reproducible as written.

This is the third sighting of that class across the fleet (fixture, docstring,
now full docs surface), each in a different medium.

**BIND-6 — the raw `writeEnabled` re-export was removed.** It was present at
`src/index.ts:47`. Removed after review: it is the one signal that *needs*
adapting, so BIND-6's re-export mandate excludes it, and offering it beside
`useWriteEnabled()` handed callers a supported-looking way to defeat the
hydration guard. The capability is not withheld — `langsys-js-typescript` is a
peer dependency and the raw signal can be imported from the core directly; this
binding declines to bless that path under its own name. Nothing had published,
so the removal cost no consumer.

**Provenance — this file cited the wrong core SHA on first publication.** The
header read `e0c2d7b`, which is the rebase-era commit this repo verified during
an earlier lane. The symlink had since moved to `82678b6`, so the citation was a
value quoted from prior notes rather than resolved from the artifact at write
time. The *measurements* were always against the real linked core and are
unaffected; only the provenance line was wrong — the documented-claim-versus-
measured-fact class landing in the one field whose entire job is provenance.

Corrected by resolving the link rather than re-reading notes:

```bash
cd node_modules/langsys-js-typescript && git rev-parse HEAD
```

Caught by the reviewer resolving the link independently. A second lane carried
the identical stale SHA, which is what makes it a class rather than a typo:
both repos quoted the same superseded value from their own documentation.

## Spec defect found

**The SSR family's profile is stated two ways.** The family summary table
(`docs/sdk-spec.mdx` line 80) says `SSR | server (JS) | no browser analogue`,
while SSR-1, SSR-2 and SSR-3 each carry `**Profiles:** browser`. The rule lines
are right — `ssrTokenStrategy`, the `client` strategy and the post-hydration
flush are browser-JS behaviour with no server-SDK analogue — so this file grades
them as applicable. Reported upstream; if the table wins instead, the three rows
above become `n/a (profile: server)`.

## Probes

All probe counts in this file are produced by `_dev_/conformance-probe.py` — reproduced in
[Reproducing](#reproducing-this-files-evidence). The filter, stated so the
counts can be checked:

- Files: `src/**/*.ts*` excluding `*.test.*` (6 files); `example/**/*.tsx` plus
  `example/e2e/*.mjs` (4 files) where noted.
- Comments stripped before matching: `/* … */` blocks and whole-line `//`
  comments. This matters — every "absent" behaviour in this file is *discussed*
  in a comment somewhere, and an unstripped grep would report participation that
  does not exist.
- The script asserts it read at least 6 source files and prints three controls.
  **A probe whose controls are zero has read nothing and its absences are
  meaningless** — an earlier revision of this file's probe did exactly that,
  reporting 0 for all nine checks because a shell glob failed to expand.

Controls, current run: `PHRASE_MARKER_ATTR` → **2**, `useSyncExternalStore` →
**4**, `tSignal|useT` → **5**.

## Ranked gaps

1. **The whole file is capped at `provisional`** by CONF-2, because `npm test`
   is jsdom with no network. The browser E2E (`npm run test:e2e`, 38 checks
   against a live local stack) is the evidence that would raise it, but it is
   not part of the unit suite and depends on a running API. Raising the ceiling
   means making that run reproducible in CI, which it currently is not.
2. **The core is consumed via a symlink, not the published tarball.** So this
   file certifies the binding against `82678b6`, not against anything a consumer
   can install. `src/upstream-precondition.test.ts` makes the substitution
   visible rather than silent, but cannot make it equivalent — a symlinked
   `dist/` bypasses the `files` allowlist, the `exports` map and publint.
3. **`open`: nothing.** The one undecided item at audit time — the raw
   `writeEnabled` re-export — was resolved by the operator during this lane and
   is recorded under [Corrections](#corrections).

## Reproducing this file's evidence

```bash
# spec text this file was written against
cd ~/Documents/dev/langsys2 && git fetch origin
git show origin/main:docs/sdk-spec.mdx        # blob 06ae105a…, main @ 7bee50d6…

# suite + types
cd ~/Documents/dev/langsys-js-react
npm run typecheck && npm test                 # 33 tests / 8 files

# probes (comment-stripped, with controls)
python3 _dev_/conformance-probe.py

# mutation 1 — unpin the server snapshot; expect 3 named failures
sed -i '' 's/writeEnabled.get, writeEnabledServerSnapshot/writeEnabled.get, writeEnabled.get/' src/hooks.ts
npx vitest run src/useWriteEnabled.test.tsx
git checkout src/hooks.ts

# mutation 2 — restore the raw re-export; expect exactly the absence row to fail
#   (edit src/index.ts:47 to add `writeEnabled` back, then:)
npx vitest run src/write-enabled-surface.test.ts
git checkout src/index.ts
```
