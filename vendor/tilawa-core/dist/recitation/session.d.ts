/**
 * `ZipformerSession` — the default recognition path of `@tilawa/core`.
 *
 * Streaming phoneme pipeline: 16 kHz PCM -> Kaldi fbank (80 mel) -> streaming
 * Zipformer2-CTC (251 tajweed-phoneme tokens) -> greedy CTC -> whole-Quran
 * n-gram search + per-surah online DP tracker -> per-word verdicts -> the
 * SDK's verse events (`emission.ts`).
 *
 * Runtime-agnostic: ONNX arrives through the same injection seam as
 * `SessionRunner` — either a whole `ort`-like namespace plus model bytes, or an
 * already-created session plus that runtime's `Tensor` constructor (the shape
 * React Native needs, where `InferenceSession.create` takes a file path).
 */
import { QuranDB } from "../quran-db.js";
import type { WorkerOutbound } from "../types.js";
import { type AyahTally, type BridgedAyahTally } from "./emission.js";
import { type EngineConfig } from "./config.js";
import { type IdentifyOptions, type IdentifyResult } from "./identify.js";
import type { ExpectedPassage, FallbackHit, WordVerdict } from "./types.js";
import { type OrtLike, type OrtSessionLike, type ZipformerIo } from "./zipformerRunner.js";
import { CorrectionController, type CorrectionAction, type RecitationMode } from "./correction.js";
import { type SlipSensitivity } from "./slipHead.js";
import { type StructuralIndexJson } from "./structural.js";
/** Mean heard ratio over an unmatched ayah's words at or above which the gap
 * counts as heard-but-unfollowed (`unclear_ayah`) rather than skipped. */
export declare const AYAH_HEARD_FRACTION = 0.5;
/** I/O manifest of the default `zipformer_a0w_ep1_a05.int8.onnx` (its encoder-frame
 * output is optional, so the same manifest drives `zipformer_interp_gentle_a05.int8.onnx`). */
export declare const DEFAULT_ZIPFORMER_IO: ZipformerIo;
/** Model bytes, or a loader that produces them (fetch, fs, asset bundle). */
export type ModelSource = Uint8Array | ArrayBuffer | (() => Uint8Array | ArrayBuffer | Promise<Uint8Array | ArrayBuffer>);
/** Parsed `zipformer_quran.json`, or a loader for it. */
export type CorpusSource = unknown | (() => unknown | Promise<unknown>);
/** Display text: a ready `QuranDB`, raw `quran.json` rows, or a loader. */
export type QuranSource = QuranDB | unknown[] | (() => unknown[] | QuranDB | Promise<unknown[] | QuranDB>);
/**
 * Build the display-text `QuranDB` from raw `quran.json` rows. The Zipformer
 * path never reads the text-CTC fields, so they default to empty.
 */
export declare function displayQuranFromRaw(raw: unknown): QuranDB;
export interface ZipformerSessionOptions {
    /**
     * The ONNX runtime namespace (`onnxruntime-web`, `onnxruntime-node`,
     * `onnxruntime-react-native`). Needed with {@link model}; skip it when you
     * pass {@link session} + {@link Tensor} yourself.
     */
    ort?: unknown;
    /** Model bytes or a loader. Required unless {@link session} is given. */
    model?: ModelSource;
    /**
     * An already-created inference session. Use this on React Native, where
     * `InferenceSession.create()` takes a model *path*, not bytes.
     */
    session?: OrtSessionLike;
    /** That runtime's `Tensor` constructor. Required with {@link session}. */
    Tensor?: OrtLike["Tensor"];
    /**
     * Execution providers for `InferenceSession.create`. When omitted and you
     * pass {@link ort} + {@link model}: `["wasm"]` under onnxruntime-web,
     * `["cpu"]` under onnxruntime-node.
     */
    executionProviders?: string[];
    /** I/O manifest. Defaults to the bundled {@link DEFAULT_ZIPFORMER_IO}. */
    io?: ZipformerIo | (() => ZipformerIo | Promise<ZipformerIo>);
    /**
     * Phoneme corpus — parsed `zipformer_quran.json` or a loader for it. Not
     * bundled (5.5 MB, NPL-1.2 derivative); see the SDK README for where to get
     * it.
     */
    corpus: CorpusSource;
    /** Display text for `verse_match` events. Optional; omit for an empty DB. */
    quran?: QuranSource;
    /** Engine knobs, merged onto {@link DEFAULT_CONFIG}. */
    config?: Partial<EngineConfig>;
    /** Silence appended by `stop()` to flush the CTC tail. Default 2.0 s. */
    tailSeconds?: number;
    /** Fraction of an ayah's words that must land to emit it. Default 0.5. */
    minWordFraction?: number;
    /** Never relocate off the surah we locked onto. Default false. */
    stayOnSurah?: boolean;
    /** Whole-ayah search over the transcript when nothing was emitted. Default true. */
    enableFallback?: boolean;
    /** Max normalized distance for that fallback to count. Default 0.5. */
    fallbackMaxDistance?: number;
    /** Let {@link verses} bridge a single short skipped ayah. Default false. */
    allowGaps?: boolean;
    /** Longest ayah (in words) `allowGaps` may bridge. Default 3. */
    gapMaxWords?: number;
    /** Streaming events, in the same order `feed()`/`stop()` return them. */
    onEvent?: (msg: WorkerOutbound) => void;
    /** Emit `debug` messages for engine events. Default false. */
    debug?: boolean;
    /**
     * Slip head over encoder frames. Off by default. `true` or `"strict"` uses
     * the no-extra-false-flag cutoff; `"high"` uses the sensitivity point.
     * If the model does not return encoder frames, the head stays off.
     */
    slipHead?: boolean | SlipSensitivity;
    /** Structural correction rules (correction mode). Default
     * {@link DEFAULT_STRUCTURAL}: both rules on, run at `stop()`. `false` turns them off. */
    structural?: StructuralOptions | false;
}
/**
 * Structural correction rules over the free decode, validated with the a0w
 * model. Correction mode only; both are on by default ({@link DEFAULT_STRUCTURAL}),
 * running once over the take at `stop()`.
 *
 * - `ayahOrder` raises `possible_skipped_ayah`. Works without
 *   {@link ZipformerSession.setExpected}: the window is the first located ayah
 *   −1 .. +4. With an expected passage the window is that passage.
 * - `similarVerse` raises `possible_substitution` (a look-alike ayah's
 *   wording) and `possible_omission` (one dropped word). Substitutions need
 *   {@link ZipformerSession.setExpected}: without a passage a swapped-in
 *   look-alike word usually reads as the other ayah, so only drops fire.
 *   Flags on or next to an ayah flagged as skipped are suppressed.
 */
export interface StructuralOptions {
    /** `true`: the a0w rule. `"guarded"`: adds the two guards frozen for the
     * shipped model (restart onto the skipped ayah's ending, undecoded audio). */
    ayahOrder?: boolean | "guarded";
    similarVerse?: boolean;
    /** Drop similar-verse flags on or next to an ayah flagged as skipped
     * (they land on the ayah beside the cut). Default true. */
    suppressNearSkip?: boolean;
    /**
     * When the rules run. `"stop"` (default): once over the whole take at
     * {@link ZipformerSession.stop}, the setting the rules were validated in;
     * the flags then come one per `correct()` call. `"pause"`: also each time a
     * pause closes a segment, so a flag can interrupt mid-recitation. A
     * similar-verse slot is judged only once a later ayah has been reached, and
     * an ayah-order jump must hold over two pauses with an ayah past the skipped
     * one already located.
     */
    timing?: "stop" | "pause";
    /** The look-alike index. Defaults to the bundled `structural-index.json`,
     * loaded on first use. */
    index?: StructuralIndexJson;
}
/** Both structural rules, run once over the take at `stop()`. */
export declare const DEFAULT_STRUCTURAL: Readonly<StructuralOptions>;
export declare class ZipformerSession {
    private readonly corpus;
    private readonly index;
    private readonly table;
    private readonly ayahIds;
    private readonly quranDb;
    private readonly runner;
    private readonly cfg;
    private readonly tailSeconds;
    private readonly minWordFraction;
    private readonly stayOnSurah;
    private readonly enableFallback;
    private readonly fallbackMaxDistance;
    private readonly allowGaps;
    private readonly gapMaxWords;
    private readonly onEvent;
    private fbank;
    private decoder;
    private readonly posteriors;
    private readonly encoderFrames;
    private readonly slipWeights;
    /** Requested sensitivity. False until the caller turns the head on. */
    private slipMode;
    /** Flips off, silently, when a producing chunk has no encoder frames. */
    private slipLive;
    private engine;
    private accumulated;
    private emitted;
    private transcriptParts;
    private lastCursor;
    /** Last `verse_match` emitted by the current tracker lock. Cleared on
     * locate / relocate / lost so an ayah gap across a jump never flags. */
    private lastMatch;
    private ayahIssuesRaised;
    readonly correction: CorrectionController;
    private practiceEngine;
    private expected;
    private skipCandidate;
    private stopping;
    private structuralRules;
    private aoRule;
    private svOn;
    private svNearSkip;
    private structuralLive;
    private st;
    lastFallback: FallbackHit | null;
    debugEnabled: boolean;
    /** Set while `identify()` runs: its decode must not reach `onEvent`. */
    private quiet;
    private constructor();
    static create(opts: ZipformerSessionOptions): Promise<ZipformerSession>;
    /**
     * Turn the structural rules on or off (see {@link StructuralOptions}).
     * Loads the bundled look-alike index the first time a rule is turned on.
     */
    setStructural(opts: StructuralOptions): Promise<void>;
    private static freshStructural;
    /** Every ayah the tracker has scored so far, in the order it first saw them. */
    get tallies(): AyahTally[];
    /**
     * The ayahs that clear the emission gate — i.e. the ones `verse_match` was
     * emitted for. Bridges one short skipped ayah when `allowGaps` is set.
     */
    get verses(): BridgedAyahTally[];
    /** Raw phoneme transcript accumulated since the last `reset()`. */
    get transcript(): string;
    /** `"searching"` until the engine locks onto a position, then `"tracking"`. */
    get engineState(): string;
    /** Effective engine config (defaults merged with the constructor overrides). */
    get config(): EngineConfig;
    /** Latest per-word acoustic verdicts of the active tracker (main or practice
     * engine). Empty before the recitation is located. Diagnostic use only. */
    verdicts(): WordVerdict[];
    /** Drop all state — new recitation, same model and corpus. */
    reset(): WorkerOutbound[];
    /** Push one chunk of mono 16 kHz float32 PCM. Any size; 480 ms works well. */
    feed(samples: Float32Array): Promise<WorkerOutbound[]>;
    /**
     * Identify a clip in one call: "which ayah is this?". Decodes `audio`
     * (mono 16 kHz float32), searches the whole Quran for the phonemes heard,
     * and returns up to `topK` ranked candidates.
     *
     * Unlike `feed()` + `stop()`, a clip that starts or ends mid-ayah is fine:
     * no share of the ayah's words has to be heard. Look-alike ayahs come back
     * side by side with `decisive: false`.
     *
     * Resets the session before and after, does not emit through `onEvent`, and
     * leaves the recitation mode as it was. Like `feed`/`stop`/`reset`, it must
     * not overlap another call on the same session. Clips longer than about
     * 30 s are identified from their start (`truncated: true`).
     */
    /**
     * Ranked candidates for what has been heard since the last `reset()`,
     * without stopping: the live counterpart of `identify()`. Call it between
     * `feed()` calls (cheap: a search over the current phoneme transcript, no
     * ONNX). The first answer is usually there 2–3 s in; each later call uses
     * everything heard so far, so the list firms up as the reciter goes on.
     * After `stop()` it also covers the flushed tail.
     *
     * Same result shape as `identify()`. It neither resets nor emits.
     */
    candidatesSoFar(opts?: IdentifyOptions): IdentifyResult;
    identify(audio: Float32Array, opts?: IdentifyOptions): Promise<IdentifyResult>;
    /**
     * Correction mode: the passage the reciter is about to read (e.g. the ayahs
     * on screen). The tracker then locks onto it at once, stays inside it, and
     * cannot be pulled into a similar passage. Ignored in tracking mode. Kept
     * across {@link reset}; pass null to clear.
     */
    setExpected(passage: ExpectedPassage | null): void;
    setMode(mode: RecitationMode): WorkerOutbound[];
    /**
     * Turn the slip head on or off. `"strict"` is the no-extra-false-flag
     * cutoff; `"high"` is the sensitivity point. A model without encoder
     * frames keeps the head off either way.
     */
    setSlipHead(mode: false | SlipSensitivity): void;
    correct(action: CorrectionAction): WorkerOutbound[];
    private correctionMessage;
    /** Alias of {@link stop} — end of audio, flush the tail, emit the sequence. */
    flush(): Promise<WorkerOutbound[]>;
    stop(): Promise<WorkerOutbound[]>;
    private finish;
    private makeEngine;
    /** GOP scoring costs a few CTC Viterbi passes per word; only correction mode reads it.
     * The slip head is the same: tracking never sees `slip`. */
    private attachPosteriors;
    private resetDecoder;
    wordCount: (surah: number, ayah: number) => number;
    private dumpTallies;
    private currentSnapshot;
    private dispatch;
    private feedSamples;
    private runFrames;
    private logTokens;
    private consumeTokens;
    /**
     * Run the structural rules once a pause closes a segment (and at the end of
     * audio), then raise the next queued flag if the controller is idle.
     */
    private structuralTick;
    private structuralVerses;
    private structuralEvaluate;
    private raiseStructural;
    private handle;
    /** Correction mode: last word-level check before the main tracker is dropped. */
    private settleCorrection;
    /**
     * Correction mode with an expected passage: raise `possible_skipped_ayah`
     * when the engine reads the audio on the current ayah as the next one. Live
     * checks must hold for 12 frames; `atSettle` raises at once.
     */
    private checkSkippedAyah;
    private noteMessages;
    private wordProgress;
    private emitNewMatches;
    /**
     * Correction mode only. `t` (ayah N+2) was just matched; if the previous
     * match of this tracker lock was ayah N of the same surah and N+1 was never
     * matched, raise one ayah-level issue for N+1. `possible_skipped_ayah` when
     * nothing of N+1 was heard, `unclear_ayah` when it was heard but not followed.
     * Word-level rules are untouched; this only covers the whole-ayah hole they
     * cannot see (no clear neighbours inside the ayah).
     */
    private checkAyahGap;
    private toVerseMatch;
    private fallbackSearch;
}
/**
 * Create the default (Zipformer) recognition session.
 *
 * ```ts
 * import * as ort from "onnxruntime-node";
 * const session = await createZipformerSession({
 *   ort,
 *   model: () => readFile("zipformer_a0w_ep1_a05.int8.onnx"),
 *   corpus: async () => JSON.parse(await readFile("zipformer_quran.json", "utf8")),
 *   quran: async () => JSON.parse(await readFile("quran.json", "utf8")),
 *   onEvent: (msg) => console.log(msg.type),
 * });
 * // executionProviders default to ["wasm"] under onnxruntime-web, ["cpu"] under node
 * await session.feed(pcm16k);
 * const final = await session.stop();
 * ```
 */
export declare function createZipformerSession(opts: ZipformerSessionOptions): Promise<ZipformerSession>;
