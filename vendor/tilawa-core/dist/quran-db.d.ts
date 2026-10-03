import type { QuranVerse } from "./types.js";
export interface QuranTokenEncoder {
    encodeRawPhonemes(rawPhonemes: string): number[];
}
export type QuranCtcTokenTable = Record<string, number[]>;
export interface QuranCandidate {
    surah: number;
    ayah: number;
    ayah_end?: number | null;
    text: string;
    phonemes_joined: string;
    phoneme_token_ids: number[];
    stage_a_score: number;
    raw_score: number;
    bonus: number;
    kind: "single" | "span";
    surah_rank?: number;
}
export interface QuranChampionMatch {
    surah: number;
    ayah: number;
    ayah_end?: number | null;
    text: string;
    phonemes_joined: string;
    score: number;
    raw_score: number;
    bonus: number;
    _prefix_rescue?: boolean;
    _global_span_rescue?: boolean;
    runners_up?: Array<{
        surah: number;
        ayah: number;
        raw_score: number;
        bonus: number;
        score: number;
        phonemes_joined: string;
    }>;
}
export interface CandidateRetrieval {
    singles: QuranCandidate[];
    spans: QuranCandidate[];
    combined: QuranCandidate[];
}
interface RetrievalOptions {
    maxSpan?: number;
    hint?: [number, number] | null;
    singleLimit?: number;
    topSurahs?: number;
    spanLimit?: number;
}
export declare function partialRatio(short: string, long: string): number;
export declare class QuranDB {
    verses: QuranVerse[];
    private _byRef;
    private _bySurah;
    private _jointPrefixSpans;
    private _jointGlobalSpans;
    /** charCode -> character id, or `null` if the corpus alphabet doesn't fit (see `_ngramCharTable`). */
    private _ngramCharIds;
    private _ngramCharIdsBuilt;
    private _verseNgrams;
    private tokenEncoder?;
    private ctcTokenTable?;
    constructor(data: QuranVerse[], tokenEncoder?: QuranTokenEncoder, ctcTokenTable?: QuranCtcTokenTable);
    get totalVerses(): number;
    get surahCount(): number;
    getVerse(surah: number, ayah: number): QuranVerse | undefined;
    getSurah(surah: number): QuranVerse[];
    getNextVerse(surah: number, ayah: number): QuranVerse | undefined;
    private _startsWithArabicBismillah;
    /** Return candidates for verses whose non-Bsm phoneme token IDs are short (≤ maxTokens). */
    getShortVerseCandidates(maxTokens?: number): QuranCandidate[];
    search(text: string, topK?: number): (QuranVerse & {
        score: number;
    })[];
    retrieveCandidates(text: string, { maxSpan, hint, singleLimit, topSurahs, spanLimit, }?: RetrievalOptions): CandidateRetrieval;
    matchVerse(text: string, threshold?: number, maxSpan?: number, hint?: [number, number] | null, returnTopK?: number): QuranChampionMatch | null;
    matchPhonemeTextJoint03(text: string, topK?: number): QuranChampionMatch[];
    bestJoint03Match(text: string): QuranChampionMatch | null;
    bestJoint03MatchForHypotheses(hypotheses: readonly string[]): {
        match: QuranChampionMatch;
        transcript: string;
    } | null;
    private _joint02MatchPhonemeText;
    private _jointSurahPrefixCandidates;
    private _jointGlobalSpanCandidates;
    private _jointShortOpeningSpanCandidate;
    private _jointCandidateVerses;
    private _jointPrefixSpanTable;
    /**
     * Every 2..7-verse span in the corpus (~37k rows), with its n-grams precomputed.
     *
     * The n-grams are packed (~4 bytes/entry) rather than `Set<string>` (~64
     * bytes/entry): at ~800 distinct n-grams per row the `Set` form is 1–2 GB, which
     * is a hard out-of-memory on a phone. Packed it is ~120 MB. Scores are unchanged —
     * every span is still enumerated and still scored.
     */
    private _jointGlobalSpanTable;
    private _spanText;
    private _computeWordTokenEnds;
    private _candidateFromVerse;
    private _candidateFromSpan;
    private _joinedSpanPhonemes;
    private _concatenatedSpanTokenIds;
    private _shortQueryBoost;
    private _continuationBonuses;
    private static _suffixPrefixScore;
    private static _jointNgrams;
    private static _intersectionSize;
    /**
     * Lazily interns every character the corpus can contribute to an n-gram, mapping
     * charCode -> a dense id in `1..NGRAM_MAX_CHAR_ID`.
     *
     * Covers `phonemes_joined` and `phonemes_joined_no_bsm` for every verse, which
     * between them are the only sources of packed corpus text (the `_ns` variants and
     * every span's phonemes are built by joining and de-spacing those two). So no
     * corpus n-gram ever contains id `0`, and a query character the corpus has never
     * seen — which packs to `0` — can never produce a spurious match.
     *
     * Returns `null` when the corpus has more than `NGRAM_MAX_CHAR_ID` distinct
     * characters, i.e. more than a phoneme or Arabic alphabet could plausibly need.
     * Callers then fall back to the `Set<string>` n-gram path, which is slower but
     * scores identically.
     */
    private _ngramCharTable;
    /**
     * Packs the n-grams of `s` into a sorted, deduplicated `Int32Array`.
     *
     * Same information as `_jointNgrams`, at ~4 bytes per entry instead of the ~64 a
     * `Set<string>` entry costs — the difference between ~6 MB and ~100 MB once cached
     * across all 6,236 verses. Intersection becomes a two-pointer merge over typed
     * arrays, which also beats iterating a `Set` of strings.
     */
    private static _packNgrams;
    /** Two-pointer intersection over sorted, deduped packed n-grams. */
    private static _intersectionSizePacked;
    /** Lazily built per-verse packed n-gram cache, parallel to `this.verses`. */
    private _verseNgramTable;
    private static _round4;
}
export {};
