/**
 * Levenshtein edit distance between two strings.
 * Uses a single-row DP approach for O(min(m,n)) space.
 */
export declare function distance(a: string, b: string): number;
/**
 * Normalized Levenshtein similarity ratio.
 * Returns 1.0 for identical strings, 0.0 for completely different.
 * Matches python-Levenshtein's `ratio()` behavior:
 *   ratio = (len(a) + len(b) - distance) / (len(a) + len(b))
 */
export declare function ratio(a: string, b: string): number;
/**
 * Semi-global edit distance: finds the minimum edit distance to align
 * the entire query against any substring of ref.
 * Free gaps at start and end of ref (row 0 initialized to 0, take min of last row).
 * Use case: "how well does this transcript fragment match somewhere inside this verse?"
 */
export declare function semiGlobalDistance(query: string, ref: string): number;
/**
 * Fragment score: how well does the query match as a fragment of ref?
 * Returns 0.0-1.0. Score of 1.0 means query is an exact substring of ref.
 * Directional: measures "how much of the query does the ref explain?"
 */
export declare function fragmentScore(query: string, ref: string): number;
