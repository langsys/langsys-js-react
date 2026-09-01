#!/usr/bin/env node
/**
 * Enumerates the core's PUBLIC instance surface and diffs it against what this
 * binding exposes. The list in any report MUST be produced by this script, not
 * typed — a hand-written expectation reproduces the very defect it checks for.
 *
 * PUBLIC is decided by the .d.ts sitting next to the resolved index.js, not by
 * the runtime chain. TypeScript's `private` is erased at runtime, so a purely
 * runtime walk reports private implementation detail as though it were API —
 * which is exactly the mistake this script made in its first revision, and the
 * reason its five "dropped methods" were not a defect at all.
 *
 * Usage:
 *   node _dev_/enumerate-surface.mjs            # diff core vs binding
 *   node _dev_/enumerate-surface.mjs --selftest # prove the diff detects a hidden member
 *
 * Exit codes: 0 = no dropped members; 1 = members dropped; 2 = selftest failed.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { realpathSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);

/**
 * Every member on an object's chain — methods, getters AND instance-own data
 * properties. The first revision counted only functions and getters, which
 * silently omitted three genuinely public members (`Translations`,
 * `translationsLoadingPromise`, `debug`): a Proxy hiding one of those reported
 * "dropped 0, exit 0".
 */
export function surfaceOf(target) {
    const out = new Set();
    let o = target;
    while (o && o !== Object.prototype) {
        for (const k of Object.getOwnPropertyNames(o)) {
            if (k === 'constructor' || k.startsWith('_')) continue;
            out.add(k);
        }
        o = Object.getPrototypeOf(o);
    }
    return [...out].sort();
}

/**
 * Names declared `private` in a .d.ts. TypeScript emits them as bare
 * `private name;` lines with no signature, which is what makes them findable.
 */
export function privateNamesFrom(dts) {
    return new Set([...dts.matchAll(/^\s*private\s+([A-Za-z_]\w*)\s*;/gm)].map((m) => m[1]));
}

/**
 * Shape of a member INCLUDING its descriptor kind. Reading `obj[name]` invokes a
 * getter and erases the distinction between a getter and a data property holding
 * the same function — so the descriptor is looked up on the chain instead.
 */
function shapeOf(obj, name) {
    let o = obj, d;
    while (o && o !== Object.prototype && !d) { d = Object.getOwnPropertyDescriptor(o, name); o = Object.getPrototypeOf(o); }
    if (!d) return 'absent';
    const kind = d.get ? 'getter' : 'value';
    let v;
    try { v = obj[name]; } catch { return `${kind}/threw`; }
    if (typeof v === 'function') {
        return `${kind}/fn/${v.length}${v.constructor?.name === 'AsyncFunction' ? '/async' : ''}`;
    }
    return `${kind}/${typeof v}`;
}

export function diff(core, binding, privateNames = new Set()) {
    const coreSurface = surfaceOf(core).filter((m) => !privateNames.has(m));
    const dropped = coreSurface.filter((m) => binding[m] === undefined);
    const shapeDiff = coreSurface
        .filter((m) => binding[m] !== undefined)
        .map((m) => ({ m, core: shapeOf(core, m), binding: shapeOf(binding, m) }))
        .filter(({ core: c, binding: b }) => c !== b);
    const notIdentical = coreSurface.filter((m) => binding[m] !== undefined && binding[m] !== core[m]);
    return { coreSurface, dropped, shapeDiff, notIdentical };
}

if (process.argv.includes('--selftest')) {
    const checks = [];

    // 1. finds a hidden METHOD
    const c1 = { a() {}, b() {}, c() {} };
    const d1 = diff(c1, new Proxy(c1, { get: (t, p) => (p === 'b' ? undefined : t[p]) }));
    checks.push(['hidden method found', d1.dropped.join() === 'b']);

    // 2. finds a hidden instance-own DATA member (the first revision could not)
    const c2 = Object.assign(Object.create({ m() {} }), { dataProp: 1 });
    const d2 = diff(c2, new Proxy(c2, { get: (t, p) => (p === 'dataProp' ? undefined : t[p]) }));
    checks.push(['hidden data member found', d2.dropped.join() === 'dataProp']);

    // 3. classification MOVES a member between columns when the .d.ts marks it private
    const c3 = { pub() {}, priv() {} };
    const asPublic = diff(c3, { pub: c3.pub }).dropped.join();
    const asPrivate = diff(c3, { pub: c3.pub }, privateNamesFrom('  private priv;')).dropped.join();
    checks.push(['private classification moves a member', asPublic === 'priv' && asPrivate === '']);

    // 4. getter-vs-data-property is detected (descriptor kind, not invoked value)
    const fn = () => 1;
    const c4 = { get t() { return fn; } };
    const d4 = diff(c4, { t: fn });
    checks.push(['descriptor kind detected', d4.shapeDiff.length === 1 && d4.shapeDiff[0].m === 't']);

    // 5. identity loss is detected
    const c5 = { m() {} };
    const d5 = diff(c5, { m: c5.m.bind(c5) });
    checks.push(['identity loss detected', d5.notIdentical.join() === 'm']);

    for (const [name, ok] of checks) console.log(`  selftest ${ok ? 'PASS' : 'FAIL'}  ${name}`);
    process.exit(checks.every(([, ok]) => ok) ? 0 : 2);
}

// Importable without side effects: the report runs only when this file IS the
// entry point, so tests and other scripts can reuse `diff`/`privateNamesFrom`.
const isEntry = process.argv[1] !== undefined
    && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
if (isEntry) {

const corePath = realpathSync(require.resolve('langsys-js-typescript'));
const coreRepo = dirname(dirname(corePath));
let sha = 'unknown';
try { sha = execSync(`git -C ${coreRepo} rev-parse --short HEAD`).toString().trim(); } catch {}

const core = require('langsys-js-typescript').LangsysApp;
const binding = require('../dist/index.js').LangsysApp;

// PUBLIC is decided by the .d.ts next to the resolved index.js — not by the
// runtime chain, where `private` has been erased.
const dtsPath = corePath.replace(/\.js$/, '.d.ts');
const privateNames = privateNamesFrom(readFileSync(dtsPath, 'utf8'));

const { coreSurface, dropped, shapeDiff, notIdentical } = diff(core, binding, privateNames);
console.log(`core module resolved: ${corePath}`);
console.log(`core repo @ ${sha}`);
console.log(`type surface: ${dtsPath}`);
console.log(`declared private in .d.ts (${privateNames.size} names, class-scoped matches excluded from the list below)`);
console.log(`core PUBLIC members (${coreSurface.length}): ${coreSurface.join(', ')}`);
console.log(`dropped (${dropped.length}): ${dropped.join(', ') || 'none'}`);
console.log(`shape differs (${shapeDiff.length}): ${shapeDiff.map((d) => `${d.m}[core=${d.core} binding=${d.binding}]`).join(', ') || 'none'}`);
console.log(`not identical by reference (${notIdentical.length}): ${notIdentical.join(', ') || 'none'}`);
// Identity is the property this binding relies on, so it must affect the exit
// code. The first revision exited on `dropped` alone: a bound-forwarding Proxy
// scored notIdentical 22 and still exited 0.
const failed = dropped.length > 0 || shapeDiff.length > 0 || notIdentical.length > 0;
process.exit(failed ? 1 : 0);
}
