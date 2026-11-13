import { seedFile, type KeySeed, type ProjectSeed } from '../contract-worlds.js';

// REF-1: a read key on a project; the lists a case reads are the case's own, crafted at setup.
const P1: ProjectSeed = { base_locale: 'en', target_locales: ['es-es'], website_url: 'https://site.local' };
const KEYS: Record<string, KeySeed> = { k1: { project: 'p1', type: 'read' } };

export default seedFile('ref1-lists', 10, { lists: { projects: { p1: P1 }, keys: KEYS, count: 1 } });
