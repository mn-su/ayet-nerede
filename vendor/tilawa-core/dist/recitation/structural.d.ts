/**
 * Structural correction rules over the free CTC decode. Quran text only, no
 * learned weights. Port of the lab prototypes `lab/scripts/ayah_order.py` and
 * `lab/scripts/similar_verse.py` (frozen settings).
 *
 * - **Ayah order** (`possible_skipped_ayah`): cut the token stream at pauses,
 *   match each segment to a word span of a local window of ayahs, and compare
 *   an in-order chain of the segments with one that may jump whole ayahs.
 * - **Similar verse** (`possible_substitution` / `possible_omission`): align
 *   the heard phonemes to the passage, and to the passage with one region of
 *   one ayah swapped for a look-alike ayah's wording or one interior word
 *   dropped.
 *
 * Pure functions over the corpus, the bundled look-alike index and timed
 * tokens; the session decides when to run them.
 */
import type { QuranCorpus } from "./corpus.js";
/** A free-decode token: symbol, absolute encoder frame (counted across decoder
 * resets), and the audio time in seconds when it was decoded. */
export interface TimedToken {
    sym: string;
    frame: number;
    t: number;
}
/** `structural-index.json`: look-alike pairs (`"s:a" -> [[ms, ma, tag, i1, i2, j1, j2, ...]]`,
 * tag 0 replace / 1 delete / 2 insert) and the ayahs ayah-order never flags. */
export interface StructuralIndexJson {
    v: number;
    pairs: Record<string, number[][]>;
    ident: string[];
}
export interface AyahOrderParams {
    /** Blank frames between two tokens that cut a segment (12 = 0.48 s). */
    gap: number;
    /** Shorter segments are merged into the previous one. */
    minChars: number;
    /** Cost per char of unexplained audio. */
    garbage: number;
    /** Cost per skipped char inside the in-order chain. */
    wcost: number;
    /** Cost of going back (restart / repeat). */
    restart: number;
    /** Cost of a forward jump over a whole ayah. */
    jump: number;
    /** Without a passage, the window is [first − back .. first + ahead]. */
    back: number;
    ahead: number;
}
export declare const AYAH_ORDER_PARAMS: Readonly<AyahOrderParams>;
export interface AyahOrderRule {
    /** Absolute margin (cost units) that flags on its own. */
    margin: number;
    /** Or: margin per char of the segment after the jump. */
    rel: number;
    /** Both flanking segments must fit at or below this cost per char. */
    fit: number;
    /** Max chars of unexplained audio between the flanking segments. */
    between: number;
    minPost: number;
    /** Never flag an ayah whose skip reads as in-order or repeated text. */
    noIdent: boolean;
    /** Drop a jump after a restart segment that also fits the skipped ayah's ending. */
    noRestartPre?: boolean;
    restartAlt?: number;
    /** Max unexplained chars as a fraction of the skipped ayah's length. */
    betweenRel?: number;
}
/** Frozen on a0w dev (acted dev skip_ayah + help clean dev + v1). */
export declare const AYAH_ORDER_RULE: Readonly<AyahOrderRule>;
/** Adds the two guards frozen for the shipped emissions. */
export declare const AYAH_ORDER_RULE_GUARDED: Readonly<AyahOrderRule>;
export interface SimilarVerseRule {
    /** Look-alike swap: margin over the canonical text (cost units). */
    lookalike: number;
    /** One- or two-word drop: margin over the canonical text. */
    drop: number;
    /** Max words a variant may replace or drop. */
    maxSpan: number;
    /** Region ± one word must align at or below this cost per char. */
    loc: number;
    /** The whole ayah must align at or below this cost per char. */
    ayahFit: number;
}
/** Frozen on a0w dev (look-alike + drop, one-word regions). */
export declare const SIMILAR_VERSE_RULE: Readonly<SimilarVerseRule>;
export interface AyahOrderJump {
    surah: number;
    ayah: number;
    fit0: number;
    fit1: number;
    between: number;
    readLater: boolean;
    /** Seconds: when the segment after the jump had been decoded. */
    at: number;
    postChars: number;
    preChars: number;
    preRestart: boolean;
    preOnSkipped: number;
    skipChars: number;
    ident: boolean;
}
export interface AyahOrderCandidate {
    margin: number;
    jumps: AyahOrderJump[];
    segs: number;
}
export interface StructuralFlag {
    kind: "possible_skipped_ayah" | "possible_substitution" | "possible_omission";
    surah: number;
    ayah: number;
    word: number;
    /** Seconds into the audio. */
    atSeconds: number;
    source: "ayah_order" | "similar_verse";
}
export interface SimilarVerseCandidate {
    slot: number;
    surah: number;
    ayah: number;
    word: number;
    kind: "possible_substitution" | "possible_omission";
    family: "lookalike" | "drop";
    span: number;
    from: [number, number];
    margin: number;
    marginAll: number;
    known: boolean;
    at: number | null;
    loc: number | null;
    ayahD: number | null;
}
interface Look {
    m: [number, number];
    regions: Array<[number, number, number, number, number]>;
}
/** Python's `round(x, nd)`: round half to even on the exact binary value. */
export declare function pyRound(x: number, nd: number): number;
/** C[i * nw + e]: edit cost of the whole query against words i..e of `ref`. */
export declare function spanCosts(q: Uint8Array, ref: Uint8Array, ws: Int32Array, maxRatio?: number, slack?: number): Float64Array;
/** Plain edit cost of `q` against `r`. */
export declare function globalCost(q: Uint8Array, r: Uint8Array): number;
export interface Segment {
    text: string;
    f0: number;
    f1: number;
    t: number;
}
/** Token stream -> pause-delimited segments. */
export declare function segmentTokens(tokens: readonly TimedToken[], gap: number, minChars: number): Segment[];
export type Ayah = readonly [number, number];
/** Look-alike index plus the ident guard, bound to a corpus. */
export declare class StructuralRules {
    readonly corpus: QuranCorpus;
    private readonly looks;
    private readonly ident;
    private readonly phCache;
    private readonly segCache;
    constructor(corpus: QuranCorpus, index: StructuralIndexJson);
    has(s: number, a: number): boolean;
    /** Phoneme words of an ayah. */
    ph(s: number, a: number): string[];
    lookalikes(s: number, a: number): readonly Look[];
    identGuarded(s: number, a: number): boolean;
    /** Window of ayahs for the ayah-order check: the expected passage, or
     * [first − back .. first + ahead] around the tracker's first verse. */
    ayahOrderWindow(expected: {
        surah: number;
        ayah: number;
        ayahEnd?: number;
    } | null, firstVerse: Ayah | null, p?: AyahOrderParams): Ayah[];
    /** `ayah_order.detect_take`: candidate jumps with their evidence; thresholds are applied by {@link ayahOrderFlags}. */
    ayahOrderCandidate(tokens: readonly TimedToken[], win: readonly Ayah[], p?: AyahOrderParams): AyahOrderCandidate | null;
    /** `similar_verse.detect_take` restricted to the look-alike and drop families. */
    similarVerseCandidates(tokens: readonly TimedToken[], passageIn: readonly Ayah[], known: boolean, durationS: number, timesFor?: (c: SimilarVerseCandidate) => boolean): SimilarVerseCandidate[];
    /** E with one region swapped for look-alike M's wording (merged runs and single ops). */
    private variantsFor;
    /** Skip ahead: E with one or two consecutive interior words missing. */
    private dropVariants;
}
/** `ayah_order.flags_of`. */
export declare function ayahOrderFlags(cand: AyahOrderCandidate | null, rule?: AyahOrderRule): StructuralFlag[];
/** Whether a candidate can pass `rule` before its timing / fit is computed. */
export declare function similarVerseEligible(c: SimilarVerseCandidate, rule?: SimilarVerseRule): boolean;
/** `similar_verse_eval.pick`: the best qualifying candidate per passage slot. */
export declare function similarVersePick(cands: readonly SimilarVerseCandidate[], rule?: SimilarVerseRule): SimilarVerseCandidate[];
/** `similar_verse.align_path`: per reference char, the last query index aligned at or before it, and its cost. */
export declare function alignPath(q: Uint8Array, r: Uint8Array): {
    last: Int32Array;
    rc: Float64Array;
};
export {};
