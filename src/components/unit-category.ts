import { createContext, useContext, useMemo } from 'react';

/**
 * The category a `<Translate>` or `<Phrase>` renders and registers under, and the one its content
 * was registered under before it moved (MOVE-1). `previousCategory` is absent (or null) when the
 * content did not move and `''` when it had no category before.
 */
export interface UnitCategory {
    category: string;
    previousCategory?: string | null;
}

/**
 * What a block that falls back to the core's DOM class (it holds a component, so its DOM is unknown
 * until React renders it) hands to the units inside it: its own resolved category and previous
 * category. A unit nested in it moved with it (MOVE-4), as a host nested in a block does in the
 * core's own walk, which reads the enclosing block's options the same way.
 */
export const BlockCategory = createContext<UnitCategory | undefined>(undefined);

/**
 * A unit's category and previous category, given what it names itself.
 *
 * A unit that names no category (the prop is absent) takes the enclosing block's category and,
 * unless it names a previous category of its own, the block's previous category (MOVE-4). One that
 * names its own category, `''` included, takes neither: it moved only if it names its own previous
 * category. A unit outside any block, naming none, has no category (`''`). The result is stable between renders with the same inputs, so it can
 * be provided to the units below without re-rendering them.
 */
export function useUnitCategory(named: string | undefined, namedPrevious: string | null | undefined): UnitCategory {
    const block = useContext(BlockCategory);
    const outerCategory = block?.category;
    const outerPrevious = block?.previousCategory;
    return useMemo(() => {
        if (named !== undefined || !block) return { category: named ?? '', previousCategory: namedPrevious };
        return { category: block.category, previousCategory: namedPrevious ?? block.previousCategory };
        // `block` is read through its two fields, so a new object with the same values changes nothing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [named, namedPrevious, block !== undefined, outerCategory, outerPrevious]);
}
