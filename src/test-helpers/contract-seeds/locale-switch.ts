import { seedFile, type KeySeed, type ProjectSeed } from '../contract-worlds.js';

// A write session on an empty project: the content a translator later adds is registered through the API by the case itself.
const P1: ProjectSeed = { base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local' };
const KEYS: Record<string, KeySeed> = { 'k-writer': { project: 'p1', type: 'write' } };

export default seedFile('locale-switch', 3, { base: { projects: { p1: P1 }, keys: KEYS, count: 1 } });
