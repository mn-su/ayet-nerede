import { type EngineConfig } from "./config.js";
import type { QuranCorpus } from "./corpus.js";
import { type QuranIndex } from "./search.js";
import type { FramePosteriors } from "./posteriors.js";
import type { EncoderFrames, SlipHead } from "./slipHead.js";
import { Tracker } from "./tracker.js";
import { VerdictTracer } from "./verdicts.js";
import type { CtcToken, EngineEvent, EngineState, ExpectedPassage, HeardChar, SearchHint } from "./types.js";
export declare class RecitationEngine {
    readonly corpus: QuranCorpus;
    readonly index: QuranIndex;
    readonly cfg: EngineConfig;
    state: EngineState;
    tracker: Tracker | null;
    tracer: VerdictTracer | null;
    framesDecoded: number;
    heardTotal: number;
    private buffer;
    private hint;
    private stay;
    private searchStartFrame;
    private lastSearchFrame;
    private lastSearchHeard;
    private lastRelocateFrame;
    private lastProgressFrame;
    private lastCharFrame;
    private locateFailedEmitted;
    private lostEmitted;
    private completedEmitted;
    private struggles;
    private relocateCandidate;
    private lastCursorWord;
    private lastStates;
    private prevSettled;
    private lastStruggleChars;
    onBeforeRelocate: (() => void) | null;
    private posteriors;
    private encoder;
    private slipHead;
    private correction;
    private expected;
    private expectedLocked;
    constructor(corpus: QuranCorpus, index: QuranIndex, cfg?: EngineConfig);
    setHint(hint: SearchHint | null): void;
    /** Frame posteriors for GOP scoring of verdicts (correction mode); null disables. */
    setPosteriors(posteriors: FramePosteriors | null): void;
    /** Encoder frames for the slip head. Null leaves `WordVerdict.slip` unset. */
    setSlip(encoder: EncoderFrames | null, head: SlipHead | null): void;
    /** Correction mode: the back-fill and stop-time alignment knobs apply. */
    setCorrection(on: boolean): void;
    /**
     * Correction mode: the passage the reciter was asked to read. The first lock
     * goes straight to its first word (after any isti'adha / basmala), later
     * searches only lock inside it, the tracker pays `outsideJumpCost` to jump
     * out of it, and nothing relocates to another surah. Null clears it.
     */
    setExpected(p: ExpectedPassage | null): void;
    private get window();
    setStayOnSurah(stay: boolean): void;
    startSearch(): void;
    track(surah: number, ayah: number, word?: number): EngineEvent[];
    feed(tokens: readonly CtcToken[], framesDecoded: number): EngineEvent[];
    lock(wordIndex: number, replay: readonly HeardChar[], how: "located" | "relocated", from?: {
        surah: number;
        ayah: number;
    }): EngineEvent[];
    private feedSearching;
    private feedTracking;
    private maybeRelocate;
    /** Buffer offset where the expected passage starts: past any isti'adha /
     * basmala, once enough has been heard to rule a still-growing one out. -1
     * while waiting. A passage that itself opens with the basmala keeps it. */
    private expectedStart;
    /**
     * Search locks only once a query is decisive, often several words into the
     * ayah, and the words before the hit never get a verdict. Start at the
     * ayah's first word instead and replay as many earlier heard chars as those
     * words should take (`backfillRatio` per expected char), never reaching
     * back into an isti'adha / basmala. `at` is the hit's offset in the buffer.
     */
    private backfill;
    /**
     * Correction mode, end of a take that never locked: align the buffered
     * chars to the best search hit (decisive or not) at or under
     * `stopAlignDistance`, for one final word check. The result is a detached
     * tracer; it never feeds verse tallies.
     */
    alignBuffer(): VerdictTracer | null;
    /**
     * Correction mode with an expected passage: the interior ayah A the tracker
     * is in, when the heard chars it aligned to A read as ayah A+1 instead (the
     * reciter skipped A and the aligner bent A+1's audio onto A's text). Uses
     * `tracker` when given (a detached stop-time tracker), else the live one.
     */
    skippedAyah(tracker?: Tracker | null): {
        surah: number;
        ayah: number;
    } | null;
    private detachedTracer;
    private isHeld;
    private settled;
    private trackingEvents;
}
