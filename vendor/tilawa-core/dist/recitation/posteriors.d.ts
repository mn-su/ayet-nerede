/** Ring of recent per-frame CTC log-probabilities, indexed by decoder frame. */
export declare class FramePosteriors {
    readonly classes: number;
    readonly capacity: number;
    private readonly data;
    private readonly best;
    private readonly bestId;
    private start;
    private end;
    constructor(classes: number, capacity?: number);
    /** Append `frames` rows (row-major [frames, classes]) starting at decoder frame `firstFrame`. */
    push(logProbs: ArrayLike<number>, frames: number, firstFrame: number): void;
    clear(at?: number): void;
    /** Frames [from, to) are all still held. */
    has(from: number, to: number): boolean;
    get firstFrame(): number;
    get endFrame(): number;
    logp(frame: number, id: number): number;
    bestLogp(frame: number): number;
    argmax(frame: number): number;
}
/** Greedy longest-match phoneme -> token ids (same as the lab PhonemeTokenizer). Null on OOV. */
export declare function encodePhonemes(text: string): number[] | null;
/** Tokenize `text` as a whole, keep the tokens that overlap chars [from, to).
 * Words are tokenized in context because a token can straddle a word boundary. */
export declare function encodePhonemeSpan(text: string, from: number, to: number): number[] | null;
/**
 * Viterbi log-likelihood of the best CTC path that emits exactly `ids` over
 * frames [from, to), with optional blanks around it. -Infinity if `ids` cannot
 * fit (too few frames).
 */
export declare function forcedLogLik(post: FramePosteriors, ids: readonly number[], from: number, to: number, blank?: number): number;
/** Sum of per-frame best log-probs over [from, to): the unconstrained competitor. */
export declare function freeLogLik(post: FramePosteriors, from: number, to: number): number;
export interface WordGop {
    /** (forced - free) / tokens over the word's acoustic window; <= 0, ~0 when the expected word fits as well as anything. Floored at {@link GOP_FLOOR}. */
    gop: number;
    /** Same, forcing the expected word twice in a row (repetition hypothesis). */
    gopTwice: number;
    /** Same, forcing nothing but blank (omission hypothesis). */
    gopNone: number;
    /** {@link pairScores} through the next word, when available. */
    repGain?: number;
    pairGop?: number;
}
export declare const GOP_FLOOR = -20;
/** Evidence over a window that runs through the next word, from token ids of
 * the word + next word (`once`) and the word twice + next word (`twice`),
 * each tokenized jointly. Per token of the word:
 * - `repGain`: forcing a second copy vs one (> 0 when a second copy is there),
 * - `pairGop`: forcing the pair vs the free decode (~0 when the two words fit
 *   together, i.e. a low single-word GOP was only a boundary misallocation). */
export declare function pairScores(post: FramePosteriors, wordTokens: number, once: readonly number[], twice: readonly number[], from: number, to: number): {
    repGain: number;
    pairGop: number;
} | null;
/** Goodness-of-pronunciation style scores for `ids` over frames [from, to). Null if frames are gone. */
export declare function wordGop(post: FramePosteriors, ids: readonly number[], from: number, to: number): WordGop | null;
