export interface VerseMatchMessage {
    type: "verse_match";
    surah: number;
    ayah: number;
    verse_text: string;
    surah_name: string;
    confidence: number;
    surrounding_verses: SurroundingVerse[];
}
export interface VerseCandidate {
    surah: number;
    ayah: number;
    ayah_end?: number | null;
    confidence: number;
    rank: number;
    source: "discovery" | "tracking";
}
export interface VerseCandidateMessage {
    type: "verse_candidate";
    candidates: VerseCandidate[];
    stable: boolean;
    final_flush: boolean;
}
export interface FinalSequenceVerse {
    surah: number;
    ayah: number;
    confidence: number;
}
export interface FinalSequenceMessage {
    type: "final_sequence";
    verses: FinalSequenceVerse[];
    confidence: number;
}
export interface WordProgressMessage {
    type: "word_progress";
    surah: number;
    ayah: number;
    word_index: number;
    total_words: number;
    matched_indices: number[];
}
export interface RawTranscriptMessage {
    type: "raw_transcript";
    text: string;
    confidence: number;
}
export interface DebugMessage {
    type: "debug";
    event: string;
    at: number;
    data: Record<string, unknown>;
}
export interface SurroundingVerse {
    surah: number;
    ayah: number;
    text: string;
    is_current: boolean;
}
export type WorkerInbound = {
    type: "init";
} | {
    type: "audio";
    samples: Float32Array;
} | {
    type: "reset";
}
/** End of audio: flush the tail and emit `final_sequence`. */
 | {
    type: "stop";
} | {
    type: "set_debug";
    enabled: boolean;
} | {
    type: "set_config";
    config: StreamingConfig;
};
export type WorkerOutbound = {
    type: "correction";
    state: import("./recitation/correction.js").CorrectionState;
    totalWords: number;
}
/** Correction mode: a soft note (e.g. `possible_repetition` in `note` mode).
 * Recitation is not interrupted and no action is needed. */
 | {
    type: "correction_note";
    issue: import("./recitation/correction.js").CorrectionIssue;
} | {
    type: "loading";
    percent: number;
} | {
    type: "loading_status";
    message: string;
} | {
    type: "ready";
} | {
    type: "error";
    message: string;
} | VerseMatchMessage | VerseCandidateMessage | FinalSequenceMessage | WordProgressMessage | RawTranscriptMessage | DebugMessage;
export interface QuranVerse {
    surah: number;
    ayah: number;
    text_uthmani: string;
    text_clean?: string;
    surah_name: string;
    surah_name_en: string;
    /** Legacy tracker adapter fields. For the text CTC pipeline these contain normalized Arabic text/tokens. */
    phonemes: string;
    phonemes_joined: string;
    phoneme_tokens?: string[];
    phoneme_tokens_no_bsm?: string[] | null;
    phoneme_token_ids?: number[];
    phoneme_token_ids_no_bsm?: number[] | null;
    word_token_ends?: number[];
    phonemes_joined_no_bsm?: string | null;
    phonemes_joined_ns?: string;
    phonemes_joined_no_bsm_ns?: string | null;
    phoneme_words: string[];
}
export interface SurahData {
    surah: number;
    surah_name: string;
    surah_name_en: string;
    verses: {
        ayah: number;
        text_uthmani: string;
    }[];
}
export declare const SAMPLE_RATE = 16000;
export declare const TRIGGER_SECONDS = 2;
export declare const TRIGGER_SAMPLES: number;
export declare const MAX_WINDOW_SECONDS = 30;
export declare const MAX_WINDOW_SAMPLES: number;
export declare const SILENCE_RMS_THRESHOLD = 0.005;
export declare const UTTERANCE_FINAL_SILENCE_SECONDS = 1.2;
export declare const UTTERANCE_FINAL_SILENCE_SAMPLES: number;
export declare const VERSE_MATCH_THRESHOLD = 0.45;
export declare const FIRST_MATCH_THRESHOLD = 0.75;
export declare const RAW_TRANSCRIPT_THRESHOLD = 0.25;
export declare const SURROUNDING_CONTEXT = 2;
export declare const DISCOVERY_REPEAT_CYCLES = 2;
export declare const DISCOVERY_TOP_SINGLE_CANDIDATES = 64;
export declare const DISCOVERY_TOP_SURAHS = 5;
export declare const DISCOVERY_MAX_SPAN = 4;
export declare const ACOUSTIC_CLEAR_MARGIN = 0.12;
export declare const ACOUSTIC_CONTINUATION_MARGIN = 0.08;
export declare const NON_CONTINUATION_JUMP_THRESHOLD = 0.65;
export declare const ACOUSTIC_OVERRIDE_TEXT_THRESHOLD = 0.55;
export declare const ACOUSTIC_OVERRIDE_MIN_MARGIN = 0.25;
export declare const DISCOVERY_EXPANDED_CANDIDATES = 200;
export declare const DISCOVERY_LOW_CONFIDENCE_WORDS = 4;
export declare const DISCOVERY_LOW_CONFIDENCE_CHARS = 18;
export declare const DISCOVERY_FUSION_TEXT_WEIGHT = 0.6;
export declare const DISCOVERY_FUSION_ACOUSTIC_WEIGHT = 0.25;
export declare const DISCOVERY_FUSION_LENGTH_WEIGHT = 0.15;
export declare const DISCOVERY_FUSION_LOW_TEXT_WEIGHT = 0.45;
export declare const DISCOVERY_FUSION_LOW_ACOUSTIC_WEIGHT = 0.4;
export declare const DISCOVERY_FUSION_LOW_LENGTH_WEIGHT = 0.15;
export declare const DISCOVERY_FUSION_SELECTION_GAP = 0.08;
export declare const TRACKING_TRIGGER_SECONDS = 0.5;
export declare const TRACKING_TRIGGER_SAMPLES: number;
export declare const TRACKING_SILENCE_TIMEOUT = 4;
export declare const TRACKING_SILENCE_SAMPLES: number;
export declare const TRACKING_MAX_WINDOW_SECONDS = 30;
export declare const TRACKING_MAX_WINDOW_SAMPLES: number;
export declare const STALE_CYCLE_LIMIT = 4;
export declare const LOOKAHEAD = 5;
export declare const TRACKING_PREFIX_TOLERANCE = 0.12;
export declare const TRACKING_WEAK_COMMIT_CONFIDENCE = 0.6;
export declare const TRACKING_COMPLETION_COVERAGE = 0.95;
export declare const ADVANCE_RELATIVE_MARGIN = 3;
export declare const ADVANCE_PREFIX_TOKENS = 15;
export declare const ADVANCE_FLUSH_STRICT_MARGIN = 0.5;
export type NextVerseEmitMode = "deferred_confirm" | "candidate_until_confirmed" | "immediate_on_completion";
export interface StreamingConfig {
    audioChunkMs: number;
    discoveryTriggerSec: number;
    trackingTriggerSec: number;
    discoveryMaxWindowSec: number;
    trackingMaxWindowSec: number;
    tailAfterCommitSec: number;
    tailAfterPendingAdvanceSec: number;
    finalSilenceSec: number;
    silenceRmsThreshold: number;
    firstMatchThreshold: number;
    verseMatchThreshold: number;
    discoveryRepeatCycles: number;
    acousticClearMargin: number;
    acousticContinuationMargin: number;
    decodeStabilityEnabled: boolean;
    decodeStabilityRatio: number;
    nonContinuationJumpThreshold: number;
    nextVerseEmitMode: NextVerseEmitMode;
    trackingCompletionCoverage: number;
    trackingPrefixTolerance: number;
    lookaheadWords: number;
    staleCycleLimit: number;
    trackingSilenceTimeoutSec: number;
    advanceRelativeMargin: number;
    advancePrefixTokens: number;
    advanceFlushStrictMargin: number;
}
export declare const CONSERVATIVE_STREAMING_CONFIG: StreamingConfig;
export declare const BALANCED_STREAMING_CONFIG: StreamingConfig;
export declare const AGGRESSIVE_ADVANCE_STREAMING_CONFIG: StreamingConfig;
export type StreamingPresetName = "conservative" | "balanced" | "aggressiveAdvance";
export declare const STREAMING_PRESETS: Record<StreamingPresetName, StreamingConfig>;
export declare const DEFAULT_STREAMING_CONFIG: StreamingConfig;
export declare function normalizeStreamingConfig(partial: Partial<StreamingConfig> | null | undefined): StreamingConfig;
