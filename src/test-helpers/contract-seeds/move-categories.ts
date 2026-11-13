import { createElement as el } from 'react';
import { generateCustomId, serializeTree } from 'langsys-js-typescript';
import { toBlockNodes } from '../../block-nodes.js';
import { seedFile, type KeySeed, type ProjectSeed } from '../contract-worlds.js';

// MOVE-1, MOVE-3, MOVE-4: content translated under `Header` that the app now renders under
// `Checkout` naming `Header` as its previous category, and one phrase under `Header` it renders
// under `Checkout` naming none (the control). No machine translation, so a translation the new
// category holds is one the API carried over.
export const MOVED_BLOCK = [el('p', null, 'Moved block'), el('p', null, 'Second paragraph')];
const mapped = toBlockNodes(MOVED_BLOCK);
if (!mapped.ok) throw new Error(mapped.reason);
const TEXTS = ['Moved block', 'Second paragraph'];

const P1: ProjectSeed = {
    base_locale: 'en',
    target_locales: ['es-es'],
    website_url: 'https://site.local',
    machine_translate_new_phrases: false,
    phrases: [
        { category: 'Header', phrase: 'Buy now', translations: { 'es-es': 'Comprá ya' } },
        { category: 'Header', phrase: 'Sign in', translations: { 'es-es': 'Ingresá' } },
        { category: 'Header', phrase: 'Not moved', translations: { 'es-es': 'No movida' } },
    ],
    blocks: [
        {
            category: 'Header',
            custom_id: generateCustomId('Header', TEXTS),
            content: serializeTree(mapped.nodes),
            phrases: [
                { phrase: 'Moved block', translations: { 'es-es': 'Bloque movido' } },
                { phrase: 'Second paragraph', translations: { 'es-es': 'Segundo párrafo' } },
            ],
        },
    ],
};
const KEYS: Record<string, KeySeed> = { 'k-writer': { project: 'p1', type: 'write' } };

export default seedFile('move-categories', 13, { moved: { projects: { p1: P1 }, keys: KEYS, count: 1 } });
