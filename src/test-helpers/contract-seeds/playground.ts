import { seedFile, type KeySeed, type ProjectSeed } from '../contract-worlds.js';

// The playground's project (`npm run fixture`, TESTING.md): the content its feature checks and
// `example-next/` render, with the Spanish translations they show, on a project that
// machine-translates new content so a read-only key's hint is accepted. It is no test's world.
const P1: ProjectSeed = {
    title: 'Local testing',
    base_locale: 'en',
    target_locales: ['es-es'],
    website_url: 'http://localhost',
    machine_translate_new_phrases: true,
    phrases: [
        { category: 'Checks', phrase: 'Feature checks', translations: { 'es-es': 'Comprobaciones' } },
        {
            category: 'Checks',
            phrase: 'You have {count} items in your cart',
            translations: { 'es-es': 'Tienes {count} artículos en tu carrito' },
        },
        { category: 'Next', phrase: 'Rendered on the server', translations: { 'es-es': 'Renderizado en el servidor' } },
        {
            category: 'Next',
            phrase: 'Rendered in a client component',
            translations: { 'es-es': 'Renderizado en un componente de cliente' },
        },
    ],
};
const KEYS: Record<string, KeySeed> = {
    // The session may write, so its misses are registered.
    'k-writer': { project: 'p1', type: 'write' },
    // Read-only from the playground's address, and permitted to report the page it is on.
    'k-public': { project: 'p1', type: 'ip_write', report_discovered_content: true },
};

export default seedFile('playground', 9, { base: { projects: { p1: P1 }, keys: KEYS, count: 1 } });
