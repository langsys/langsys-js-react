import { seedFile, type KeySeed, type ProjectSeed } from '../contract-worlds.js';

// HINT-13: a read-only session permitted to report, on a project that machine-translates new content, the only kind that accepts a hint.
const P1: ProjectSeed = { base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local', machine_translate_new_phrases: true };
const KEYS: Record<string, KeySeed> = { 'k-public': { project: 'p1', type: 'ip_write', report_discovered_content: true } };

export default seedFile('hint13', 2, { base: { projects: { p1: P1 }, keys: KEYS, count: 1 } });
