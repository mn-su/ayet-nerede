import type { WordVerdict } from './types.js';
export type RecitationMode = 'tracking' | 'correction';
export type CorrectionAction = 'retry' | 'stop_retry' | 'dismiss' | 'review_later' | 'continue' | 'close';
export interface RecitationPosition {
    surah: number;
    ayah: number;
    word: number;
}
export interface CorrectionIssue extends RecitationPosition {
    wordIndex: number;
    /** Word-level kinds come from {@link possibleWordIssues}. The two ayah-level
     * kinds are raised by the session when ayah N+2 is matched right after ayah N
     * and N+1 never was: `possible_skipped_ayah` when nothing of N+1 was heard,
     * `unclear_ayah` when audio was heard but the model could not follow it.
     * `possible_repetition` needs GOP scores (correction mode). */
    kind: 'possible_omission' | 'possible_substitution' | 'possible_vowel' | 'possible_repetition' | 'possible_skipped_ayah' | 'unclear_ayah';
    /** Words the issue covers, starting at `word`. Default 1; ayah-level kinds
     * set it to the ayah length so a retry must clear the whole ayah. */
    words?: number;
    /** Set when a structural rule (not the word-level rules) raised the issue. */
    source?: 'ayah_order' | 'similar_verse';
}
export declare const AYAH_ISSUE_KINDS: ReadonlySet<CorrectionIssue['kind']>;
export interface CorrectionThresholds {
    /** Min CTC margin on a mismatched heard vowel before it counts as evidence. */
    vowelMargin: number;
    /** Min mean word margin for a vowel flag (the whole word must be confidently heard). */
    vowelWordMargin: number;
    /** Max heard ratio of a `skipped` word that counts as an omission. 0 = only
     * words with nothing aligned. A `skipped` word is always below the engine's
     * `minHeardFraction`, so 1 accepts every partial omission. */
    omissionMaxHeard?: number;
    /** GOP rule, for verdicts carrying `gop` (correction mode): a `wrong` or
     * `skipped` word whose GOP (nats/token) is at or below this. `-Infinity`
     * disables it. */
    gopFlag?: number;
    /** A neighbour anchors a GOP flag when it is clear, or fits with GOP at or above this. */
    gopAnchor?: number;
    /** Check words `observe()` never judged in full context when the tracker is
     * dropped (stop, surah completed, silent idle). */
    settle?: boolean;
    /** Repetition: a word that fits once (GOP >= `gopAnchor`) but gains at least
     * this (nats/token) from forcing a second copy before the next word.
     * `Infinity` disables it. */
    repetitionGain?: number;
    /** Aligner states the GOP rule may flag. */
    gopOnWrong?: boolean;
    gopOnSkipped?: boolean;
    /** Kinds the GOP rule may raise. */
    gopOmission?: boolean;
    gopSubstitution?: boolean;
    /** A GOP word is an omission when silence fits its window this much better
     * (nats/token) than the expected word, and at least `gopNoneMin`. */
    gopNoneMargin?: number;
    gopNoneMin?: number;
    /** The GOP word must be the worst fit of itself and its neighbours. */
    gopLocalMin?: boolean;
    /** Frames a GOP-only candidate must persist before it is raised (other rules use 12). */
    gopPersistFrames?: number;
    /** Let `settle()` raise GOP-only issues. */
    settleGop?: boolean;
    /** Min aligner distance of a `wrong` word for a substitution flag. */
    substitutionDistance?: number;
    /** `possible_repetition` handling. `note` never interrupts: the issue is
     * queued on {@link CorrectionController.takeNotes} (the session emits a
     * `correction_note`) and the reciter carries on. */
    repetitionMode?: 'off' | 'note' | 'flag';
    /** Slip head. Flag a word whose `slip` probability is at or above this.
     * `Infinity` (the default) leaves it off. The kind still comes from the
     * aligner: skipped → omission, distance ≤ 0.15 → vowel, otherwise
     * substitution. Neighbours must be anchored, same guard as GOP. */
    slipFlag?: number;
}
/** GOP is off by default: on real clean takes it still raises false flags
 * that the other rules do not. The other GOP fields are the gating to use with
 * it (`gopFlag: -5`): wrong words only, substitutions only, outside settle. */
export declare const DEFAULT_CORRECTION_THRESHOLDS: Required<CorrectionThresholds>;
export interface CorrectionState {
    phase: 'idle' | 'error' | 'retrying' | 'corrected';
    issue: CorrectionIssue | null;
    resume: RecitationPosition | null;
    attempt: number;
    outcome: 'dismissed' | 'deferred' | 'corrected' | null;
}
export declare function possibleWordIssues(verdicts: readonly WordVerdict[], thresholds?: Partial<CorrectionThresholds>): CorrectionIssue[];
/** Pure state machine. Pass full, non-forced-settled acoustic snapshots only.
 * Frames must be monotonic within an observation stream. A new retry gets a new
 * attempt ID, so old audio/results cannot accidentally produce success. */
export declare class CorrectionController {
    mode: RecitationMode;
    thresholds: CorrectionThresholds;
    state: CorrectionState;
    private suppressed;
    private candidates;
    private retryFrame;
    /** Words observe() has judged with their context settled (both neighbours
     * and the word after next) since the last settle(). */
    private seenSettled;
    private notes;
    reset(): void;
    clearEvidence(): void;
    setMode(mode: RecitationMode): void;
    observe(verdicts: readonly WordVerdict[], cursor: RecitationPosition, frame: number, attempt?: number): boolean;
    /** Soft notes (repetition in `note` mode) raised since the last call. They
     * never change {@link state}. */
    takeNotes(): CorrectionIssue[];
    private queueNote;
    /** Final word-level check on settled verdicts when the tracker is about to
     * be dropped (end of audio, surah completed, silent idle). Settled verdicts
     * no longer change, so no persistence is required. Without it, an error in
     * the last words before a stop is never judged with its right neighbour.
     * Only words observe() never judged in full context are checked, and vowel
     * flags stay observe-only. Raises the earliest issue. */
    settle(verdicts: readonly WordVerdict[], cursor: RecitationPosition): boolean;
    /** Raise an issue the session inferred outside the word-level rules (the
     * ayah-level kinds). Same gates as a word flag: correction mode, idle, not
     * dismissed/deferred earlier in this session. */
    raise(issue: CorrectionIssue, cursor: RecitationPosition): boolean;
    act(action: CorrectionAction): boolean;
}
