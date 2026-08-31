import re, glob, sys, json
SRC = [f for f in glob.glob('src/**/*.ts*', recursive=True) if '.test.' not in f]
EX  = [f for f in glob.glob('example/**/*.tsx', recursive=True)] + glob.glob('example/e2e/*.mjs')
def strip(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    t = re.sub(r'^\s*//[^\n]*$', '', t, flags=re.M)
    return t
def probe(label, pattern, files):
    n = 0; hits = []
    for f in files:
        for i, line in enumerate(strip(open(f).read()).split('\n'), 1):
            if re.search(pattern, line):
                n += 1; hits.append(f'{f}:{i}')
    print(f'  {label:<44} {n:>3}   {"; ".join(hits[:3])}')
    return n
print(f'  files scanned: src={len(SRC)} example={len(EX)}')
assert len(SRC) >= 6, 'probe read too few files — would report false zeros'
print()
probe('memoization in front of t()', r'useMemo|useCallback|React\.memo|\bmemo\(', SRC+EX)
probe('raw writeEnabled re-export', r'export\s*\{[^}]*\bwriteEnabled\b', SRC)
probe('branch on key_type / key string', r'key_type|keyType', SRC)
probe('network calls authored here', r'\bfetch\(|XMLHttpRequest|axios', SRC)
probe('timers/scheduling authored here', r'setTimeout|setInterval|queueMicrotask', SRC)
probe('storage access authored here', r'sessionStorage|localStorage', SRC)
probe('lookup caching authored here', r'\bnew Map\(|\bcache\b', SRC)
probe('hardcoded phrase-marker literal', r"['\"]data-ls-phrase['\"]", SRC)
print()
print('  CONTROLS (must be non-zero, else the probe is not reading code):')
probe('PHRASE_MARKER_ATTR imported/used', r'PHRASE_MARKER_ATTR', SRC)
probe('useSyncExternalStore used', r'useSyncExternalStore', SRC)
probe('t()/tSignal referenced', r'tSignal|useT\b', SRC)

print()
print('  ADDITIONAL probes claimed in CONFORMANCE.md:')
probe('ssrTokenStrategy authored here', r'ssrTokenStrategy', SRC)
probe('interpolation authored here', r'\binterpolate\b|\bisICU\b', SRC)
probe('identity computed here', r'generateCustomId|\bmd5\b', SRC)
