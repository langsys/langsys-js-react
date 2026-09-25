#!/usr/bin/env python3
"""
Validates CONFORMANCE.md against the fleet's canonical format, so the tally a
report quotes is computed rather than asserted.

Usage: python3 _dev_/check-conformance.py SPEC.mdx [CONFORMANCE.md] [--selftest]
Exit: 0 format-valid; 1 format violations; 2 selftest failed.
Format-valid is NOT green: green also needs zero partial / not implemented / held.
"""
import re, sys
from collections import Counter

BLOB = '33bbc4095ef2d13a55926b71045a7094f6b9706a'
REV_ROW = f'| **Spec revision read** | langsys2 9b23f3d8…, docs/sdk-spec.mdx blob {BLOB} |'
PROFILE_ROW = '| **Profiles** | browser, binding, all — derived: binding over langsys-js-typescript |'
CLAIMED = {'browser', 'binding', 'all'}
STATUSES = re.compile(r'^(implemented|provisional|delegated|partial|not implemented|held \(strip ruling\)|waived|'
                      r'n/a \(profile: [^)]+\)|n/a \(architecture: .+\))$')
TIERS = {'live', 'contract', 'mock', 'n/a (pure)', '-'}

def spec_rules(text):
    out = {}
    for m in re.finditer(r'^#{2,4} +([A-Z]{3,6}-\d+)\b[^\n]*\n(.*?)(?=^#{2,4} +[A-Z]{3,6}-\d+\b|\Z)', text, re.M | re.S):
        pm = re.search(r'\*\*Profiles?:\*\*\s*([^\n]+)', m.group(2))
        out[m.group(1)] = pm.group(1) if pm else ''
    return out

def check(spec, conf):
    errs = []
    if REV_ROW not in conf: errs.append('header: canonical Spec revision read row missing or altered')
    if PROFILE_ROW not in conf: errs.append('header: canonical Profiles row missing or altered')
    tables = [i for i, l in enumerate(conf.split('\n')) if l.startswith('| Rule | Status | Tier | Evidence |')]
    if len(tables) != 1: errs.append(f'expected exactly one status table, found {len(tables)}')
    rules = spec_rules(spec)
    seen, statuses = Counter(), Counter()
    if tables:
        lines = conf.split('\n')[tables[0] + 2:]
        for l in lines:
            if not l.startswith('|'): break
            cells = [c.strip() for c in re.split(r'(?<!\\)\|', l)[1:-1]]
            if len(cells) != 4: errs.append(f'row does not have 4 cells: {l[:60]}'); continue
            rid, status, tier, ev = cells
            if not re.fullmatch(r'[A-Z]{3,6}-\d+', rid): errs.append(f'not a single rule id: {rid!r}'); continue
            seen[rid] += 1; statuses[status] += 1
            if rid not in rules: errs.append(f'{rid}: not in spec')
            if not STATUSES.match(status): errs.append(f'{rid}: status {status!r} not canonical')
            if tier not in TIERS: errs.append(f'{rid}: tier {tier!r} not canonical')
            if status == 'implemented' and tier not in {'live', 'contract', 'n/a (pure)'}: errs.append(f'{rid}: implemented needs live/contract/n/a (pure), got {tier}')
            if status == 'provisional' and tier != 'mock': errs.append(f'{rid}: provisional needs mock, got {tier}')
            if status == 'delegated':
                if tier != '-': errs.append(f'{rid}: delegated takes tier -, got {tier}')
                if not re.search(r'Core row', ev): errs.append(f'{rid}: delegated evidence must name the core row')
                if not re.search(r'probe', ev, re.I) or not re.search(r'control', ev, re.I): errs.append(f'{rid}: delegated evidence must name an absence probe and its control')
            pm = re.match(r'n/a \(profile: ([^)]+)\)', status)
            if pm and rid in rules:
                line = rules[rid].lower()
                if any(p in line for p in CLAIMED): errs.append(f'{rid}: n/a (profile) but its Profiles line names a claimed profile: {rules[rid]!r}')
    for rid in rules:
        if seen[rid] == 0: errs.append(f'{rid}: not graded')
        elif seen[rid] > 1: errs.append(f'{rid}: graded {seen[rid]} times')
    return errs, statuses, len(rules), sum(seen.values())

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    spec = open(args[0]).read()
    conf_path = args[1] if len(args) > 1 else 'CONFORMANCE.md'
    conf = open(conf_path).read()
    if '--selftest' in sys.argv:
        # Each mutation must be CAUGHT, or the validator's pass means nothing.
        mutants = {
            'duplicate id': conf.replace('| GATE-2 |', '| GATE-1 |', 1),
            'wildcard family row': conf.replace('| REG-1 |', '| REG-1..12 |', 1),
            'wrong blob': conf.replace(BLOB, 'deadbeef' * 5, 1),
            'implemented with mock tier': conf.replace('| BIND-1 | implemented | n/a (pure) |', '| BIND-1 | implemented | mock |', 1),
            'delegated without probe': re.sub(r'(\| CAT-1 \| delegated \| - \| )[^\n]*', r'\1Core row CAT-1 only.', conf, count=1),
            'n/a profile on a browser rule': conf.replace('| HINT-3 | delegated | - |', '| HINT-3 | n/a (profile: server) | - |', 1),
            'missing rule': re.sub(r'\n\| CONF-3 \|[^\n]*', '', conf, count=1),
        }
        ok = True
        for name, mutant in mutants.items():
            caught = bool(check(spec, mutant)[0])
            ok &= caught
            print(f'  selftest {"CAUGHT" if caught else "MISSED"}  {name}')
        base_errs = check(spec, conf)[0]
        print(f'  baseline file: {"valid" if not base_errs else "INVALID"}')
        sys.exit(0 if ok and not base_errs else 2)
    errs, statuses, n_rules, n_rows = check(spec, conf)
    print(f'spec rules: {n_rules}   graded rows: {n_rows}')
    for k, v in sorted(statuses.items(), key=lambda x: -x[1]): print(f'  {k:<28} {v}')
    blocking = sum(v for k, v in statuses.items() if k in {'partial', 'not implemented'} or k.startswith('held'))
    print(f'format: {"VALID" if not errs else "INVALID"}   green: {"yes" if not errs and blocking == 0 else f"no ({blocking} blocking rows)"}')
    for e in errs: print(f'  ✗ {e}')
    sys.exit(1 if errs else 0)

main()
