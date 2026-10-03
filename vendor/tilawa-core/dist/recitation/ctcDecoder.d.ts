import type { CtcToken, HeardChar } from "./types.js";
export declare const SHORT_VOWEL_ORDER: readonly ["َ", "ُ", "ِ"];
export declare class GreedyCtcDecoder {
    readonly symbols: readonly string[];
    readonly blank: number;
    /** For tokens ending in a short vowel: ids of the same token with each of the three vowels. */
    private readonly siblings;
    private previousBest;
    private frameIndex;
    private run;
    constructor(symbols: readonly string[], blank: number);
    get framesDecoded(): number;
    /** Start frame of the token still being decoded (not yet emitted), if any. */
    get pendingFrame(): number | null;
    reset(): void;
    consume(logProbs: ArrayLike<number>, frames: number, classes: number): CtcToken[];
    flush(): CtcToken[];
    private step;
    private emit;
}
export declare function expandTokens(tokens: readonly CtcToken[]): HeardChar[];
