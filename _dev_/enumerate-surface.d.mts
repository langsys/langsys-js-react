/**
 * Types for the surface enumerator, so `src/surface.test.ts` can import the
 * classification helper rather than re-implementing its regex. One
 * implementation, two consumers — a second copy would drift and then the suite
 * and the enumerator would disagree about what "public" means.
 */
export declare const CORE_CLASS: string;

/** Every member on an object's prototype chain, including instance-own data. */
export declare function surfaceOf(target: object): string[];

/**
 * Names declared `private` inside one class block of a `.d.ts`.
 * Omit `className` for a file-global scan (fixtures only — a file-global scan
 * across multiple classes is a false-negative channel).
 */
export declare function privateNamesFrom(dts: string, className?: string): Set<string>;

export declare function diff(
    core: object,
    binding: object,
    privateNames?: Set<string>,
): {
    coreSurface: string[];
    dropped: string[];
    shapeDiff: { m: string; core: string; binding: string }[];
    notIdentical: string[];
};
