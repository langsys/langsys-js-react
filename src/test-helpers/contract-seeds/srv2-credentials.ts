import { seedFile, type KeySeed, type ProjectSeed } from '../contract-worlds.js';

// SRV-2: three projects, each holding the same phrase translated its own way, so a render shows
// which project's catalog it read; `p0` is the one `init()` names. Each key writes, so each
// render's misses are stored in the project they were sent for.
const project = (translation: string): ProjectSeed => ({
    base_locale: 'en',
    target_locales: ['es-es'],
    website_url: 'https://site.local',
    phrases: [{ category: 'UI', phrase: 'Pricing', translations: { 'es-es': translation } }],
});
const KEYS: Record<string, KeySeed> = {
    k0: { project: 'p0', type: 'write' },
    k1: { project: 'p1', type: 'write' },
    k2: { project: 'p2', type: 'write' },
};

export default seedFile('srv2-credentials', 11, {
    tenants: { projects: { p0: project('Precios cero'), p1: project('Precios uno'), p2: project('Precios dos') }, keys: KEYS, count: 1 },
});
