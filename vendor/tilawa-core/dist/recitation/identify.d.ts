/**
 * One-shot identification of a short clip: "which ayah is this?"
 *
 * The streaming engine is built for a reciter who keeps going. It waits for
 * half of an ayah's words before it emits, and its whole-ayah fallback skips
 * any ayah much longer than the clip. A 5 s excerpt from the middle of a long
 * ayah therefore comes back empty, or as a short, unrelated ayah at full
 * confidence.
 *
 * `identifyTranscript` skips the tracker. It runs the whole-Quran n-gram +
 * semi-global search (`QuranIndex.search`) over the clip's phoneme transcript
 * and returns the ranked spans it found. A mid-ayah start is fine, and
 * look-alike ayahs come back side by side instead of as one silent pick.
 */
import type { QuranDB } from "../quran-db.js";
import type { QuranCorpus } from "./corpus.js";
import type { QuranIndex } from "./search.js";
import type { FallbackHit } from "./types.js";
/** Longest transcript (phoneme characters) searched at once. About 25–30 s of
 * recitation; longer clips are identified from their first part. */
export declare const IDENTIFY_MAX_CHARS = 400;
export declare const IDENTIFY_DEFAULT_TOP_K = 5;
export interface IdentifyOptions {
    /**
     * How many candidates to return. Default 5. Candidates tied with the best
     * one are kept too (up to twice `topK`), so that an ayah repeated word for
     * word elsewhere is never cut off at an arbitrary rank.
     */
    topK?: number;
    /** Samples per `feed()` call while decoding. Default 4800 (300 ms). */
    chunkSamples?: number;
}
export interface IdentifyCandidate {
    surah: number;
    ayah: number;
    /** 0-based word index within `ayah` where the matched span starts. */
    word: number;
    /** Last ayah the span reaches; equals `ayah` when it stays inside one. */
    ayahEnd: number;
    /** 0-based word index within `ayahEnd` where the span ends (inclusive). */
    wordEnd: number;
    /** Phoneme edit distance of the span, normalised to [0, 1]. Lower is better. */
    distance: number;
    /** `1 - distance`, clamped to [0, 1] and rounded to 2 decimals. */
    confidence: number;
    /** `search` = n-gram span search; `whole-ayah` = a short clip matched to a
     * whole short ayah; `basmala` = only a basmala was heard. */
    how: "search" | "whole-ayah" | "basmala";
    surah_name: string;
    surah_name_en: string;
    /** Uthmani text of `ayah` when display text was passed to the session. */
    verse_text: string;
}
export interface IdentifyResult {
    /** Best first. Empty when nothing came close. */
    candidates: IdentifyCandidate[];
    /**
     * How many candidates tie with the best one. Above 1, the clip matches
     * the same passage in several places (e.g. 67:25 = 10:48 = 21:38 = 27:71
     * = 34:29 = 36:48) and only context can tell them apart.
     */
    tied: number;
    /**
     * True when the best candidate is close enough and clearly ahead of the
     * next distinct one. On the 30-clip mid-ayah benchmark every decisive answer
     * was right; when this is false, show the user the list.
     */
    decisive: boolean;
    /** Phoneme transcript the search ran on. */
    transcript: string;
    /** True when the transcript was longer than `IDENTIFY_MAX_CHARS` and only
     * its start was searched. */
    truncated: boolean;
}
export interface IdentifyDeps {
    index: QuranIndex;
    corpus: QuranCorpus;
    quran?: QuranDB | null;
    /** Whole-ayah match for clips too short for the span search. */
    fallback?: (text: string) => FallbackHit | null;
}
/**
 * Rank the places in the Quran a phoneme transcript could come from.
 * Pure: no ONNX, no session state — `ZipformerSession.identify` decodes the
 * audio and calls this.
 */
export declare function identifyTranscript(transcript: string, deps: IdentifyDeps, opts?: IdentifyOptions): IdentifyResult;
