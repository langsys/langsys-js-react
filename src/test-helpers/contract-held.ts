import type { HeldCatalog } from './contract-fixture.js';

/**
 * Reads of what the API holds, shaped for the contract tests' assertions. They take a catalog as
 * `fx.held` returns it, which is the catalog the API serves the project's key.
 */

/** A block as `listHeld` names it: its phrases in the order the catalog lists them (sorted, since the API promises no order). */
export const block = (...phrases: string[]) => `BLOCK[${[...phrases].sort().join('|')}]`;

/** Every phrase and block the catalog holds, as `category:phrase` and `category:BLOCK[phrases]`, sorted. */
export function listHeld(held: HeldCatalog): string[] {
    return [
        ...Object.entries(held.phrases).flatMap(([category, phrases]) =>
            phrases.map((phrase) => `${category}:${phrase}`)
        ),
        ...Object.entries(held.blocks).flatMap(([category, blocks]) =>
            Object.values(blocks).map((phrases) => `${category}:${block(...phrases)}`)
        ),
    ].sort();
}

/** The phrases the catalog holds under `category`, standalone ones only, sorted. */
export const phrasesIn = (held: HeldCatalog, category: string): string[] => [...(held.phrases[category] ?? [])].sort();

/** The phrase lists of the blocks the catalog holds under `category`, each in the catalog's order, sorted by block id. */
export const blocksIn = (held: HeldCatalog, category: string): string[][] =>
    Object.entries(held.blocks[category] ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, phrases]) => phrases);

/** Every text the catalog holds: standalone phrases and the phrases of blocks, under any category. */
export const everyText = (held: HeldCatalog): string[] => [
    ...Object.values(held.phrases).flat(),
    ...Object.values(held.blocks).flatMap((blocks) => Object.values(blocks).flat()),
];
