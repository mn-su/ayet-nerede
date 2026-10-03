/**
 * Logistic slip head over frozen Zipformer encoder frames.
 *
 * A word's score is the probe's L2 logistic on the concatenated mean and max
 * of its tracker span, padded by one frame. The head decides whether to flag;
 * the kind still comes from the aligner. Weights are the a0w refit
 * (`slip-weights.json`). No encoder frames → the session never reads this.
 */
export declare const ENCODER_DIM = 512;
/** Frames added on each side of a tracker word span. Matches the probe. */
export declare const SLIP_PAD = 1;
/** Spans longer than this are cropped to the middle. Matches `build_units.py`. */
export declare const SLIP_SPAN_CAP = 80;
export type SlipSensitivity = "strict" | "high";
export interface SlipHead {
    /** Train-set mean of `[mean ‖ max]`, length 1024. */
    mu: Float32Array;
    /** Train-set std, zeros already replaced by 1. Length 1024. */
    sd: Float32Array;
    /** Logistic coefficients on the standardized features. Length 1024. */
    coef: Float32Array;
    intercept: number;
    /** P(slip) cutoff: no extra false flags. Test-informed (0.987). */
    strict: number;
    /** P(slip) cutoff: sensitivity trade-off, about +0.10 flags per minute. */
    high: number;
}
export interface SlipWeightJson {
    mu: number[];
    sd: number[];
    coef: number[];
    intercept: number;
    thresholds: {
        strict: number;
        high: number;
    };
}
/** Ring of encoder rows indexed by decoder frame. Cleared with the decoder. */
export declare class EncoderFrames {
    readonly dim: number;
    readonly capacity: number;
    private readonly data;
    private start;
    private end;
    constructor(dim?: number, capacity?: number);
    get firstFrame(): number;
    get endFrame(): number;
    /** Append `frames` rows (row-major `[frames, dim]`) starting at decoder frame `firstFrame`. */
    push(rows: ArrayLike<number>, frames: number, firstFrame: number): void;
    clear(at?: number): void;
    has(from: number, to: number): boolean;
    row(frame: number, into: Float32Array, offset: number): void;
}
export declare function slipHeadFromJson(raw: SlipWeightJson): SlipHead;
/** Shipped a0w logistic. Thresholds are the probe's OOF clean-pool cutoffs. */
export declare const A0W_SLIP_HEAD: SlipHead;
export declare function slipThreshold(head: SlipHead, sensitivity: SlipSensitivity): number;
/**
 * Mean and max over encoder frames `[a, b)`, padded by `pad`, cropped the
 * same way the probe built its training rows. Null when the ring no longer
 * holds the slice.
 */
export declare function poolEncoderSpan(enc: EncoderFrames, a: number, b: number, pad?: number): {
    mean: Float32Array;
    max: Float32Array;
} | null;
/** sklearn `predict_proba` of the standardized `[mean ‖ max]` vector. */
export declare function slipProbability(head: SlipHead, mean: Float32Array, max: Float32Array): number;
export interface TrailWordSpan {
    surah: number;
    ayah: number;
    word: number;
    wordIndex: number;
    /** Encoder-frame interval `[a, b)` of the tracker's chars, before padding. */
    a: number;
    b: number;
    skipped: boolean;
}
/** The bits of a tracker `units_from_track` needs. */
export interface TrailLike {
    heard: readonly {
        frame: number;
    }[];
    trail: readonly number[];
    firstWord: number;
    len: number;
    localWordOfPos: ArrayLike<number>;
    corpus: {
        wordSurah: ArrayLike<number>;
        wordAyah: ArrayLike<number>;
        wordInAyah: ArrayLike<number>;
    };
}
/**
 * Tracker chars → word spans in encoder frames. A skipped word takes its
 * share of the gap between the neighbours the tracker did emit. Same split
 * as `lab/scripts/head_probe/common.py` `units_from_track`.
 */
export declare function wordSpansFromTrail(tracker: TrailLike): TrailWordSpan[];
