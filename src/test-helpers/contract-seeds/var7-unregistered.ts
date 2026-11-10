import { seedFile, type KeySeed, type ProjectSeed } from '../contract-worlds.js';

// VAR-7: a write session on an empty project, so every phrase and block it holds is one the SDK registered.
const P1: ProjectSeed = { base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local' };
const KEYS: Record<string, KeySeed> = { 'k-writer': { project: 'p1', type: 'write' } };

export default seedFile('var7-unregistered', 7, { base: { projects: { p1: P1 }, keys: KEYS, count: 1 } });
