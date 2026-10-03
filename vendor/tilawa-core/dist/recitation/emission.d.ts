/**
 * Verse emission policy: turns the engine's per-word verdicts into the SDK's
 * ayah-level events. Pure bookkeeping — no audio, no model, no I/O.
 */
import type { FallbackHit, VerdictState } from "./types.js";
export declare const MIN_WORD_FRACTION = 0.5;
export declare const FALLBACK_MAX_DISTANCE = 0.5;
/**
 * The slice of a tracker `WordVerdict` emission needs. Widened on purpose so
 * callers can hand over partial verdicts (tests, replayed vectors).
 */
export interface EmissionVerdict {
    surah: number;
    ayah: number;
    word: number;
    wordIndex?: number;
    state: VerdictState;
}
/** {@link FallbackHit} with `how` relaxed — emission only reads the distance. */
export type EmissionFallback = Pick<FallbackHit, "surah" | "ayah" | "distance"> & {
    how?: string;
};
export interface AyahTally {
    surah: number;
    ayah: number;
    ok: number;
    unsure: number;
    wrong: number;
    skipped: number;
    pending: number;
    words: number;
    firstSeen: number;
}
/** Where the tracker's cursor sits, as far as emission cares. */
export interface EmissionCursor {
    surah: number;
    ayah: number;
    word: number;
}
export type WordCountFn = (surah: number, ayah: number) => number;
export declare function ayahKey(t: {
    surah: number;
    ayah: number;
}): string;
export declare function ayahConfidence(t: AyahTally): number;
export declare function ayahMeetsGate(t: AyahTally, minWordFraction?: number): boolean;
/** Rebuild per-ayah counts from one tracker snapshot. Does not increment. */
export declare function snapshotTallies(verdicts: readonly EmissionVerdict[], wordCount: WordCountFn): Map<string, AyahTally>;
/** Add `src` counts into `dest` (harness tallyAyahs dump). Keeps earlier firstSeen. */
export declare function accumulateSnapshot(dest: Map<string, AyahTally>, src: Map<string, AyahTally>): void;
export declare function mergeTallies(accumulated: Map<string, AyahTally>, current: Map<string, AyahTally>): Map<string, AyahTally>;
export declare function newlyEligibleAyahs(tallies: Map<string, AyahTally> | Iterable<AyahTally>, alreadyEmitted: Set<string>, minWordFraction?: number): AyahTally[];
export declare function shouldRunFallback(emitted: readonly unknown[]): boolean;
export declare const GAP_MAX_WORDS = 3;
/** An {@link AyahTally} flagged as filled in by {@link bridgeGapAyahs}. */
export interface BridgedAyahTally extends AyahTally {
    bridged?: boolean;
}
/**
 * Inject a below-gate short ayah only when both its neighbours already emit.
 *
 * Prefix fill is forbidden: a tally for ayah 3 with accepted [4, 5] stays out.
 * Off by default (`allowGaps`) — it trades precision for recall on the very
 * short ayahs the tracker skates over (e.g. 55:64 "mudhāmmatān").
 */
export declare function bridgeGapAyahs(accepted: readonly AyahTally[], tallies: readonly AyahTally[], gapMaxWords?: number): BridgedAyahTally[];
export declare function fallbackConfidence(distance: number): number;
export declare function buildFinalSequence(tallies: readonly AyahTally[], fallback: EmissionFallback | null, minWordFraction?: number): {
    verses: {
        surah: number;
        ayah: number;
        confidence: number;
    }[];
    confidence: number;
};
export declare function wordProgressFromCursor(cursor: EmissionCursor, verdicts: readonly EmissionVerdict[], totalWords: number): {
    type: "word_progress";
    surah: number;
    ayah: number;
    word_index: number;
    total_words: number;
    matched_indices: number[];
};
