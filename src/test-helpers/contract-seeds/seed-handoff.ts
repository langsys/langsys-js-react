import { seedFile, type KeySeed, type ProjectSeed } from '../contract-worlds.js';

// SRV-3, SRV-4: a write session on an empty project, so a block it holds is one the SDK registered.
const P1: ProjectSeed = { base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local' };
const KEYS: Record<string, KeySeed> = { 'k-writer': { project: 'p1', type: 'write' } };

export default seedFile('seed-handoff', 6, { base: { projects: { p1: P1 }, keys: KEYS, count: 1 } });
