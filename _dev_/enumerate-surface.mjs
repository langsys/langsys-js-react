#!/usr/bin/env node
/**
 * Enumerates the core's public instance surface and diffs it against what this
 * binding exposes. The list in any report MUST be produced by this script, not
 * typed — a hand-written expectation reproduces the very defect it checks for.
 *
 * Usage:
 *   node _dev_/enumerate-surface.mjs            # diff core vs binding
 *   node _dev_/enumerate-surface.mjs --selftest # prove the diff detects a hidden member
 *
 * Exit codes: 0 = no dropped members; 1 = members dropped; 2 = selftest failed.
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);

/** Every non-private callable/getter member on an object's prototype chain. */
export function surfaceOf(target) {
    const out = new Set();
    let o = target;
    while (o && o !== Object.prototype) {
        for (const k of Object.getOwnPropertyNames(o)) {
            if (k === 'constructor' || k.startsWith('_')) continue;
            const d = Object.getOwnPropertyDescriptor(o, k);
            if (d && (typeof d.value === 'function' || d.get)) out.add(k);
        }
        o = Object.getPrototypeOf(o);
    }
    return [...out].sort();
}

/** Shape of a member, for detecting silent signature drift as well as absence. */
function shapeOf(obj, name) {
    let v;
    try { v = obj[name]; } catch { return 'threw'; }
    if (typeof v === 'function') {
        return `fn/${v.length}${v.constructor?.name === 'AsyncFunction' ? '/async' : ''}`;
    }
    return typeof v;
}

export function diff(core, binding) {
    const coreSurface = surfaceOf(core);
    const dropped = coreSurface.filter((m) => binding[m] === undefined);
    const shapeDiff = coreSurface
        .filter((m) => binding[m] !== undefined)
        .map((m) => ({ m, core: shapeOf(core, m), binding: shapeOf(binding, m) }))
        .filter(({ core: c, binding: b }) => c !== b);
    const notIdentical = coreSurface.filter((m) => binding[m] !== undefined && binding[m] !== core[m]);
    return { coreSurface, dropped, shapeDiff, notIdentical };
}

if (process.argv.includes('--selftest')) {
    // POSITIVE CONTROL: the diff must find a deliberately hidden member.
    const core = { a() {}, b() {}, c() {} };
    const hidden = new Proxy(core, { get: (t, p) => (p === 'b' ? undefined : t[p]) });
    const { dropped } = diff(core, hidden);
    const ok = dropped.length === 1 && dropped[0] === 'b';
    console.log(`selftest: hid 'b' -> dropped=${JSON.stringify(dropped)}  ${ok ? 'PASS' : 'FAIL'}`);
    process.exit(ok ? 0 : 2);
}

const corePath = realpathSync(require.resolve('langsys-js-typescript'));
const coreRepo = dirname(dirname(corePath));
let sha = 'unknown';
try { sha = execSync(`git -C ${coreRepo} rev-parse --short HEAD`).toString().trim(); } catch {}

const core = require('langsys-js-typescript').LangsysApp;
const binding = require('../dist/index.js').LangsysApp;

const { coreSurface, dropped, shapeDiff, notIdentical } = diff(core, binding);
console.log(`core module resolved: ${corePath}`);
console.log(`core repo @ ${sha}`);
console.log(`core public members (${coreSurface.length}): ${coreSurface.join(', ')}`);
console.log(`dropped (${dropped.length}): ${dropped.join(', ') || 'none'}`);
console.log(`shape differs (${shapeDiff.length}): ${shapeDiff.map((d) => `${d.m}[core=${d.core} binding=${d.binding}]`).join(', ') || 'none'}`);
console.log(`not identical by reference (${notIdentical.length}): ${notIdentical.join(', ') || 'none'}`);
process.exit(dropped.length === 0 ? 0 : 1);
