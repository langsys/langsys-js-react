#!/usr/bin/env python3
"""
Absence probes for every core-owned rule family this binding DELEGATES.

Each probe searches this binding's shipped source for the machinery that would
mean it participates in a core-owned behaviour. A delegated row is only
credible if its probe reports zero AND a paired control from the same files
reports non-zero — a probe whose control is also zero has read nothing, and its
zero proves nothing. That exact failure has already happened once in this repo.

Comments are stripped before matching: the docs in src/ discuss most of these
terms, and an unstripped grep reports participation that does not exist.

Usage: python3 _dev_/family-probes.py [--json OUT]   exit 1 if any control is zero
"""
import glob, json, re, sys

SRC = sorted(f for f in glob.glob('src/**/*.ts*', recursive=True) if '.test.' not in f and '/test-helpers/' not in f)
assert len(SRC) >= 6, f'read {len(SRC)} source files; expected >= 6 — probes would report false zeros'

def strip(text):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'^\s*//[^\n]*$', '', text, flags=re.M)

CODE = {f: strip(open(f).read()) for f in SRC}

def count(pattern):
    n, where = 0, []
    for f, body in CODE.items():
        for i, line in enumerate(body.split('\n'), 1):
            if re.search(pattern, line):
                n += 1; where.append(f'{f}:{i}')
    return n, where

# family -> (absence probe, control) ; control must fire in the same files
FAMILIES = {
    'GATE':  (r'key_type|keyType|write_enabled|\bcanWrite\b|shouldQueue', r'useSyncExternalStore'),
    'CAT':   (r'missingToken|__uncategorized__|lookupCat|hasOwnProperty', r'\bsTranslations\b'),
    'REG':   (r'\bfetch\(|XMLHttpRequest|keepalive|sendBeacon|createTranslatableItems|updateTokens|setTimeout|setInterval|queueMicrotask', r'\buseEffect\b'),
    'HINT':  (r'discovery|page_url|sessionStorage|localStorage|location\.href|normalizeHintUrl', r'\bcreateElement\b'),
    'ICU':   (r'\binterpolate\b|\bisICU\b|IntlMessageFormat|\bplural\b|\bselectordinal\b', r'\bTFunction\b'),
    'CID':   (r'generateCustomId|\bmd5\b|createHash|\bsha1\b', r'\bcustom_id\b'),
    'TOK':   (r'tokenizeElement|TreeWalker|\bchildNodes\b|\bnodeType\b|aria-label|data-tooltip', r'\bcreateElement\b'),
    'MARK':  (r'data-langsys-|getAttribute\(|querySelector|\.closest\(', r'PHRASE_MARKER_ATTR'),
    'RESOLVED': (r'resolved|RESOLVED_MARKER|parentElement|\.closest\(', r'\bnew Vanilla(Translate|Phrase)\b'),
    'SSR':   (r'ssrTokenStrategy|typeof window|\bisSSR\b', r'useSyncExternalStore'),
    'GRANT': (r'X-Write-Grant|resolveWriteGrant|\bwriteGrant\s*[:=]|Authorization', r'\bsetWriteGrant\b'),
    'CACHE': (r'new Map\(|new WeakMap\(|\bcache\b|localStorage', r'\buseState\b'),
    'OBS':   (r'console\.(warn|error|log)|\blogger\b', r'\buseEffect\b'),
    'MSG':   (r'\.(message|template|params|code)\b|fillTemplate|templateMarkers|messagesCategory|[\'"]Errors[\'"]', r'\brenderServerMessage\b'),
    # Re-exporting the core's LegacyFormatError / LegacyKeyFile is not participation; resolving,
    # converting or rewriting the option would be.
    'MIG':   (r'legacyKeys\s*[:=]|setLegacyKeys\(|convertLegacy|createLegacyKeys|[Mm]igrat|i18next|trans_choice|\{\{', r'\buseT\b'),
    # Re-exporting SnapshotError / CatalogSnapshot is not participation; loading, parsing or seeding would be.
    'SNAP':  (r'loadSnapshot\(|parseSnapshot|buildSnapshot|snapshotChecksum|seedCatalog|initialTranslations\s*[:=]', r'\bLangsysApp\b'),
    'SRV':   (r'Accept-Language|document\.cookie|\bcookies\(|\bheaders\(\)|AsyncLocalStorage|\bVary\b', r'\buseSyncExternalStore\b'),
    'WIRE':  (r'X-Authorization|\bheaders\b|setBaseUrl\(|\bapiurl\b|toLowerCase\(|canonicalizeLocale\(', r'\bLangsysAppAPI\b'),
}

out, bad = {}, []
print(f'files scanned: {len(SRC)}  ({", ".join(SRC)})')
print(f'{"family":<7} {"probe":>5} {"control":>7}  status')
for fam, (probe, control) in FAMILIES.items():
    pn, pw = count(probe); cn, _ = count(control)
    ok = pn == 0 and cn > 0
    if cn == 0: bad.append(fam)
    out[fam] = {'probe': probe, 'probe_hits': pn, 'probe_where': pw, 'control': control, 'control_hits': cn, 'ok': ok}
    print(f'{fam:<7} {pn:>5} {cn:>7}  {"ok" if ok else ("PROBE FIRED " + ";".join(pw[:3]) if pn else "CONTROL ZERO")}')

if '--json' in sys.argv:
    json.dump(out, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=2)
sys.exit(1 if bad or any(v['probe_hits'] for v in out.values()) else 0)
