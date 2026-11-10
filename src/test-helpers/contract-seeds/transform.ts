import { seedFile, type KeySeed, type ProjectSeed } from '../contract-worlds.js';

// VAR-6: a write session on an empty project, so every phrase and block it holds is one the SDK registered.
const P1: ProjectSeed = { base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local' };
const KEYS: Record<string, KeySeed> = { 'k-writer': { project: 'p1', type: 'write' } };

export default seedFile('transform', 8, { base: { projects: { p1: P1 }, keys: KEYS, count: 1 } });
