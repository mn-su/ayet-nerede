import { type EngineConfig } from "./config.js";
import type { CostTable } from "./phonemeCost.js";
import type { Tracker } from "./tracker.js";
import type { HeardChar, WordVerdict } from "./types.js";
import { type FramePosteriors } from "./posteriors.js";
import { type EncoderFrames, type SlipHead } from "./slipHead.js";
export declare function pausalPhonemes(phonemes: string, plain: string, atAyahEnd: boolean): string | null;
export declare class VerdictTracer {
    readonly tracker: Tracker;
    private readonly table;
    private readonly cfg;
    private cache;
    private cacheRevision;
    private gopCache;
    private idsCache;
    private pairCache;
    /** Correction mode: settled verdicts align the tracker's last stretch through
     * the end of its ayah when the cursor stopped within this many words of it
     * (0 = off), so a word dropped near the end does not pull the last word's
     * audio onto itself and leave the last word unheard. */
    anchorAyahEnd: number;
    /** When set, non-pending interior words also get GOP scores (correction mode). */
    posteriors: FramePosteriors | null;
    /** Encoder frames + logistic. Both set only when the slip head is on. */
    encoder: EncoderFrames | null;
    slipHead: SlipHead | null;
    constructor(tracker: Tracker, table: CostTable, cfg?: EngineConfig);
    get cursorWordIndex(): number;
    verdicts(settled?: boolean): WordVerdict[];
    /** Ref cell just past the ayah holding `cell`, when `cell` lies within the
     * last `anchorAyahEnd` words of that ayah; else `cell`. */
    private ayahEndCell;
    /** P(slip) on each non-pending word, pooled over the tracker's own span. */
    private attachSlip;
    /** Attach GOP scores to settled words whose two neighbours were heard. The
     * acoustic window is the frames strictly between the previous word's last
     * token (and its continuation) and the next word's first token. */
    private score;
    /** Jointly tokenized ids of word + next word, and word twice + next word. */
    private pairIds;
    /** Token ids of the word's full and (if any) pausal phonemes. */
    private wordIds;
    private segment;
    private alignSegment;
    private judge;
    private lastRun;
    private makeVerdict;
}
/** Count aligned short-vowel substitutions inside one word. Only positions where
 * the heard char and the expected char are both short vowels count; consonant
 * errors, insertions and deletions are the distance's job. The expected word's
 * final vowel is always ignored: waqf drops it, and the model's Quranic prior
 * confidently rewrites case endings (e.g. الأرضَ heard as الأرضِ at p=0.99 on a
 * clean reference clip), so it cannot be trusted as evidence against the reciter. */
export declare function vowelMismatches(heard: readonly HeardChar[], from: number, heardSlice: string, expected: string, table: CostTable): {
    errors: number;
    margin: number;
};
