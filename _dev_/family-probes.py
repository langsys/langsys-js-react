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
       python3 _dev_/family-probes.py --selftest    plants a hit for every probe and its control in
                                                    a synthetic source, and checks a comment is not read;
                                                    exit 2 if any pattern cannot fire
"""
import glob, json, re, sys

# The runtime binding only. Build-time tooling — the placeholder transform (src/transform/) and the
# Next config helper and loader — runs in a bundler, never in an app, so it cannot participate in
# the core's runtime behaviour these families guard.
BUILD_TIME = ('/transform/', 'src/next.ts', 'src/next-loader.ts')
SRC = sorted(
    f for f in glob.glob('src/**/*.ts*', recursive=True)
    if '.test.' not in f and '/test-helpers/' not in f and not any(b in f for b in BUILD_TIME)
)
assert len(SRC) >= 6, f'read {len(SRC)} source files; expected >= 6 — probes would report false zeros'

def strip(text):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    return re.sub(r'^\s*//[^\n]*$', '', text, flags=re.M)

CODE = {f: strip(open(f).read()) for f in SRC}

def count(pattern, code=None):
    n, where = 0, []
    for f, body in (CODE if code is None else code).items():
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
    # Re-exporting the core's interpolate by reference is not participation; importing it to call
    # it here would be, and the call still fires.
    'ICU':   (r"\binterpolate\b(?!\s*\}\s*from\s*'langsys-js-typescript')|\bisICU\b|IntlMessageFormat|\bplural\b|\bselectordinal\b", r'\bTFunction\b'),
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
    # Loading or parsing a snapshot is the core's. Seeding the page with a request's catalog before
    # hydration (<LangsysProvider>'s seedCatalog) is SRV-4's binding half, graded there, not here.
    'SNAP':  (r'loadSnapshot\(|parseSnapshot|buildSnapshot|snapshotChecksum|initialTranslations\s*[:=]', r'\bLangsysApp\b'),
    # SRV-6: choosing a locale from the request. The AsyncLocalStorage src/server.ts hands the core
    # for SRV-7 is not locale resolution, so it is not in this pattern.
    'SRV':   (r'Accept-Language|document\.cookie|\bcookies\(|\bheaders\(\)|\bVary\b|searchParams|req\.url|request\.url', r'\buseSyncExternalStore\b'),
    # VAR-3: reading value markers is the core's; the binding emits none (its transform passes params).
    'VAR':   (r'[\'"`]/?ls:|data-ls-param|VAR_PARAM_ATTR|createComment|nodeValue', r'\bregisterBlock\b'),
    # FRM-6: the locale header is the core's localeHeaders(), re-exported; the binding builds none.
    'FRM':   (r'Accept-Language|accept-language', r'\bLangsysApp\b'),
    'WIRE':  (r'X-Authorization|\bheaders\b|setBaseUrl\(|\bapiurl\b|toLowerCase\(|canonicalizeLocale\(', r'\bLangsysAppAPI\b'),
    # MOVE-1..5: the previous category is handed to the core and read by it. The binding writes no
    # `previous_category` on the wire, stamps no previous-identity marker and runs no lookup of its own;
    # the prop it forwards is the control.
    'MOVE':  (r'previous_category|data-(ls|langsys)-previous|previousCategoryLookup|lookupPrevious', r'\bpreviousCategory\b'),
    # REF-1: the reference lists are the core's calls, reached through LangsysApp by reference. A
    # binding sends and holds nothing of its own: no list path, no list call authored here.
    'REF':   (r'countries/|currencies/|dial-codes|locales/(flat|data)|append_target_locales|\bget(Countries|Currencies|DialCodes|Locales\w*)\(', r'\bLangsysApp\b'),
}

# One line each that its probe must match, and one its control must match (selftest).
PLANTED = {
    'GATE': ("const w = cfg.write_enabled;", "useSyncExternalStore(a, b);"),
    'CAT': ("const m = missingToken;", "sTranslations.get();"),
    'REG': ("await fetch(url);", "useEffect(() => {});"),
    'HINT': ("localStorage.setItem('a', 'b');", "document.createElement('p');"),
    'ICU': ("const v = isICU(x);", "const f: TFunction = t;"),
    'CID': ("const id = generateCustomId(a);", "const p = { custom_id: 'x' };"),
    'TOK': ("const w = new TreeWalker();", "document.createElement('p');"),
    'MARK': ("el.getAttribute('data-x');", "const a = PHRASE_MARKER_ATTR;"),
    'RESOLVED': ("const r = el.closest('x');", "new VanillaTranslate();"),
    'SSR': ("if (typeof window === 'undefined') return;", "useSyncExternalStore(a, b);"),
    'GRANT': ("h['X-Write-Grant'] = g;", "setWriteGrant(g);"),
    'CACHE': ("const c = new Map();", "const [a, b] = useState(0);"),
    'OBS': ("console.warn('x');", "useEffect(() => {});"),
    'MSG': ("const o = messagesCategory;", "renderServerMessage(e);"),
    'MIG': ("convertLegacy(files);", "const t = useT();"),
    'SNAP': ("loadSnapshot(s);", "LangsysApp.init({});"),
    'SRV': ("const l = req.headers['Accept-Language'];", "useSyncExternalStore(a, b);"),
    'VAR': ("el.setAttribute('data-ls-param', n);", "registerBlock(n, o);"),
    'FRM': ("h['Accept-Language'] = l;", "LangsysApp.init({});"),
    'WIRE': ("const u = l.toLowerCase();", "const a = LangsysAppAPI;"),
    'MOVE': ("body.previous_category = p;", "const p = props.previousCategory;"),
    'REF': ("const l = await LangsysApp.getCountries('en');", "LangsysApp.init({});"),
}


def selftest():
    ok = True
    assert set(PLANTED) == set(FAMILIES), 'every family needs a planted pair'
    for fam, (probe, control) in FAMILIES.items():
        hit, ctl = PLANTED[fam]
        # The same comment strip the real sources go through.
        code = {'planted.ts': strip(f'{hit}\n{ctl}')}
        commented = {'planted.ts': strip(f'// {hit}\n/* {hit} */\n{ctl}')}
        empty = {'planted.ts': 'const x = 1;'}
        results = {
            'probe fires on a planted hit': count(probe, code)[0] >= 1,
            'control fires on its own line': count(control, code)[0] >= 1,
            'a hit in a comment is not read': count(probe, commented)[0] == 0,
            'a source with neither reads control zero': count(control, empty)[0] == 0 and count(probe, empty)[0] == 0,
        }
        for name, passed in results.items():
            ok &= passed
            if not passed: print(f'  selftest MISSED  {fam}: {name}')
    print(f'  selftest {"all caught" if ok else "FAILED"}: {len(FAMILIES)} families x 4 checks')
    sys.exit(0 if ok else 2)


if '--selftest' in sys.argv: selftest()

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
