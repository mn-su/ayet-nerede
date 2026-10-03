import { QuranDB, type QuranChampionMatch } from "./quran-db.js";
import type { AcousticEvidence } from "./ctc-rescore.js";
import type { StreamingConfig, WorkerOutbound } from "./types.js";
export interface BeamVerseMatch {
    /** Index into the quran_phonemes array */
    verseIndex: number;
    /** Number of verses in the span (1 for single, 2-3 for multi) */
    spanLength: number;
    /** Beam log-probability score */
    score: number;
}
export interface TranscribeResult {
    text: string;
    rawPhonemes: string;
    tokenIds?: number[];
    acoustic?: AcousticEvidence;
    /** Verse matches from trie-constrained beam search (if available) */
    beamMatches?: BeamVerseMatch[];
    /** Final match from the champion joint03 decode/matcher path. */
    championMatch?: QuranChampionMatch;
    championTranscript?: string;
}
type TranscribeFn = (audio: Float32Array) => Promise<TranscribeResult>;
export type TrackerDiagnosticEvent = {
    type: "discovery_cycle";
    text: string;
    final_flush: boolean;
    candidates: Array<{
        ref: string;
        kind: "single" | "span";
        stageA: number;
        acoustic: number;
        acousticMargin?: number;
        lengthFit?: number;
        fusion?: number;
        feasible?: boolean;
    }>;
    beam?: Array<{
        ref: string;
        spanLength: number;
        score: number;
    }>;
} | {
    type: "silence_skip";
    mode: "discovery" | "tracking";
    reason: string;
} | {
    type: "tracking_cycle";
    ref: string;
    text_length: number;
    word_matches: number;
    acoustic_word: number | null;
    char_word: number | null;
    advanced: boolean;
    final_flush: boolean;
    word_position: number;
    total_words: number;
    coverage: number;
    pending: boolean;
} | {
    type: "pending_emission";
    action: "armed" | "confirmed" | "final_flush_emit" | "dropped" | "cascade_blocked";
    ref: string;
    margin: number | null;
    fresh_samples: number;
    matched_indices?: number[];
} | {
    type: "advance_decision";
    from_ref: string;
    to_ref: string | null;
    action: "wait" | "armed" | "blocked";
    reason: string;
    word_position: number;
    total_words: number;
    coverage: number;
    completion_target: number;
    final_word: boolean;
    advance_ok: boolean;
    early_advance_ok: boolean;
    margin: number | null;
    normal_margin: number;
    strict_margin: number;
} | {
    type: "commit";
    ref: string;
    reason: string;
    confidence: number;
    origin?: "discovery" | "short_rescue" | "tracking_auto";
    selected_rank?: number | null;
    selected_feasible?: boolean | null;
    selected_fusion?: number | null;
    top_ref?: string | null;
    top_fusion?: number | null;
    effective_score?: number;
    threshold?: number;
    acoustic_margin?: number;
    length_fit?: number;
    clear_margin?: boolean;
    repeated_leader?: boolean;
    final_flush_commit?: boolean;
    is_continuation?: boolean;
} | {
    type: "rollback";
    reason: string;
    restored_ref: string | null;
} | {
    type: "stale_exit";
    ref: string;
    stale_cycles: number;
} | {
    type: "flush";
    mode: "discovery" | "tracking";
    duration_sec: number;
};
export interface RecitationTrackerOptions {
    onDiagnostic?: (event: TrackerDiagnosticEvent) => void;
    config?: Partial<StreamingConfig>;
}
export declare class RecitationTracker {
    private utteranceAudio;
    private newAudioCount;
    private silenceSamples;
    private utteranceHasSpeech;
    private didFinalFlush;
    private lastEmittedRef;
    private lastEmittedText;
    private prevEmittedRef;
    private prevEmittedText;
    private pendingLeader;
    private lastCommitEvidence;
    private trackingVerse;
    private trackingVerseWords;
    private trackingPrefixes;
    private trackingLastWordIdx;
    private trackingProgressEstablished;
    private staleCycles;
    private cyclesSinceCommit;
    private lastTrackingResult;
    private consecutiveAutoAdvances;
    private lastRawPhonemes;
    private trackingPendingEmission;
    private pendingEmissionMessage;
    private pendingEmissionMargin;
    private preAdvanceSnapshot;
    private totalSamplesFed;
    private samplesAtAdvance;
    private hypothesis;
    private config;
    private db;
    private transcribe;
    private options;
    constructor(db: QuranDB, transcribe: TranscribeFn, options?: RecitationTrackerOptions);
    setConfig(config: Partial<StreamingConfig>): void;
    feed(samples: Float32Array): Promise<WorkerOutbound[]>;
    private _handleTracking;
    private _handleDiscovery;
    private _candidateMessage;
    private _resolveTrackingAcousticWord;
    private _rankCandidates;
    private _charLevelProgress;
    private _enterTracking;
    private _exitTracking;
    private _rollbackWeakCommit;
    private _retainTailAfterCommit;
    private _resetUtterance;
    private _isContinuation;
    private _clearPendingEmission;
    private _emitDiagnostic;
    private samplesForSeconds;
}
export {};
