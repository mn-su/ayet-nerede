import { QuranDB } from "./quran-db.js";
import type { TranscribeResult } from "./tracker.js";
import { TextCTCDecoder } from "./text-ctc-decode.js";
import { type CtcTokenTable } from "./quran-text-adapter.js";
import { type StreamingConfig, type WorkerOutbound } from "./types.js";
import type { SessionRunner } from "./session.js";
import { ZipformerSession, type ZipformerSessionOptions } from "./recitation/session.js";
export type { SessionRunner, SessionOutput } from "./session.js";
export * from "./recitation/index.js";
export * from "./types.js";
export { QuranDB } from "./quran-db.js";
export type { QuranChampionMatch, QuranTokenEncoder, QuranCtcTokenTable, QuranCandidate, } from "./quran-db.js";
export { TextCTCDecoder } from "./text-ctc-decode.js";
export type { TextCTCResult } from "./text-ctc-decode.js";
export { RecitationTracker } from "./tracker.js";
export type { TranscribeResult, TrackerDiagnosticEvent, RecitationTrackerOptions, BeamVerseMatch, } from "./tracker.js";
export type { AcousticEvidence } from "./ctc-rescore.js";
export { adaptQuranTextData, validateCtcTokenRoundTrip } from "./quran-text-adapter.js";
export type { CtcTokenTable } from "./quran-text-adapter.js";
/**
 * JSON assets the app developer loads and hands to the SDK. Model bytes go into
 * the `SessionRunner` — these are the text-side blobs only.
 */
export interface TilawaAssets {
    /** vocab.json — CTC token id -> string map. */
    vocab: Record<string, string>;
    /** quran_ctc_tokens.json — verse key -> CTC token id sequence. */
    quranCtcTokens: CtcTokenTable;
    /** quran.json — raw verse records (surah/ayah/text_uthmani/...). */
    quran: unknown[];
    /** Optional CTC blank id. Defaults to 1024 (export_metadata.blank_id). */
    blankId?: number;
}
export interface CreateTilawaSessionOptions {
    /** Initial streaming config (merged onto BALANCED preset). */
    config?: Partial<StreamingConfig>;
    /** Streaming events (verse matches, candidates, progress) from `feed()`. */
    onOutput?: (msg: WorkerOutbound) => void;
    /** Tracker/transcribe diagnostics — the `postDebug` firehose. */
    onDiagnostic?: (event: string, data: Record<string, unknown>) => void;
}
/** One-shot transcription result following the AGENTS.md predict() contract. */
export interface TilawaPrediction {
    surah: number;
    ayah: number;
    ayah_end: number | null;
    score: number;
    transcript: string;
}
export interface TilawaSession {
    /** One-shot: transcribe a full clip and return the best verse match. */
    transcribe(audio: Float32Array): Promise<TilawaPrediction>;
    /** Low-level one-shot returning the full TranscribeResult (acoustic + champion). */
    transcribeRaw(audio: Float32Array): Promise<TranscribeResult>;
    /** Streaming: feed a chunk; emits via `onOutput`. Returns the same messages. */
    feed(audioChunk: Float32Array): Promise<WorkerOutbound[]>;
    /** Reset the streaming tracker (new recitation). */
    reset(): void;
    /** Update streaming config live. */
    setConfig(config: Partial<StreamingConfig>): void;
    /** Current effective streaming config. */
    getConfig(): StreamingConfig;
    /** Underlying QuranDB (verse lookup, search). */
    readonly db: QuranDB;
    /** Underlying CTC decoder. */
    readonly decoder: TextCTCDecoder;
}
/** Missing FastConformer asset keys, using the public names (`ctcTokens` not `quranCtcTokens`). */
export declare function missingFastConformerAssets(assets: unknown): string[];
export declare function createTilawaSession(runner: SessionRunner, assets: TilawaAssets, options?: CreateTilawaSessionOptions): TilawaSession;
/** Which acoustic pipeline recognizes the recitation. */
export type EngineName = "zipformer" | "fastconformer";
/** Zipformer is the default: better accuracy, no text-CTC assets to ship. */
export declare const DEFAULT_ENGINE: EngineName;
/** What both engines agree on: PCM in, `WorkerOutbound` verse events out. */
export interface RecognitionSession {
    readonly engine: EngineName;
    /** Push one chunk of mono 16 kHz float32 PCM. */
    feed(audioChunk: Float32Array): Promise<WorkerOutbound[]>;
    /** End of audio: flush the tail, emit the remaining verses + `final_sequence`. */
    stop(): Promise<WorkerOutbound[]>;
    /** Alias of {@link stop}. */
    flush(): Promise<WorkerOutbound[]>;
    /** Drop all state — new recitation, same model. */
    reset(): void;
    /** The Zipformer session, when `engine === "zipformer"`. */
    readonly zipformer: ZipformerSession | null;
    /** The FastConformer session, when `engine === "fastconformer"`. */
    readonly fastconformer: TilawaSession | null;
}
export interface FastConformerEngineOptions extends CreateTilawaSessionOptions {
    engine: "fastconformer";
    /** The ONNX injection seam — see {@link SessionRunner}. */
    runner: SessionRunner;
    /** vocab.json + quran_ctc_tokens.json + quran.json. */
    assets: TilawaAssets;
}
export type ZipformerEngineOptions = ZipformerSessionOptions & {
    engine?: "zipformer";
};
export type CreateRecognitionSessionOptions = ZipformerEngineOptions | FastConformerEngineOptions;
/**
 * Create a recognition session for either engine.
 *
 * Defaults to `"zipformer"` — the streaming phoneme engine. Pass
 * `engine: "fastconformer"` with a `SessionRunner` plus text-CTC assets
 * for the original pipeline. Missing FastConformer assets throw before use.
 */
export declare function createRecognitionSession(options: CreateRecognitionSessionOptions): Promise<RecognitionSession>;
