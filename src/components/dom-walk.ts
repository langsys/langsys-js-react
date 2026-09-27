import { createContext } from 'react';

/**
 * True under a `<Translate>` that fell back to the core's DOM class. That class's walk registers
 * the stamped block hosts and phrase hosts nested in it (MARK-4), so a tree-rendered `<Translate>`
 * or `<Phrase>` under it leaves its registration to the walk; registering it too would send the
 * same unit twice.
 */
export const UnderDomWalk = createContext(false);
