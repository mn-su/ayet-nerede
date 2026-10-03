export interface TensorLike {
    data: Float32Array | BigInt64Array | Int32Array;
    dims: readonly number[];
    type: string;
}
export interface OrtSessionLike {
    run(feeds: Record<string, TensorLike>): Promise<Record<string, TensorLike>>;
}
export interface OrtWasmEnv {
    numThreads?: number;
    [key: string]: unknown;
}
export interface OrtLike {
    InferenceSession: {
        create(model: Uint8Array | ArrayBuffer, options?: {
            executionProviders?: string[];
            graphOptimizationLevel?: string;
        }): Promise<OrtSessionLike>;
    };
    Tensor: new (type: string, data: Float32Array | BigInt64Array | Int32Array, dims: readonly number[]) => TensorLike;
    env?: {
        wasm?: OrtWasmEnv;
    };
    /** onnxruntime-common ≥1.21 — node lists cpu, web lists wasm. */
    listSupportedBackends?: () => Array<{
        name: string;
    }>;
}
/**
 * Pick an EP when the caller did not pass `executionProviders`.
 *
 * `ort.env.wasm` exists on both onnxruntime-web *and* onnxruntime-node (the
 * object comes from onnxruntime-common). Prefer `listSupportedBackends()` when
 * present (node → cpu; web → wasm). Fall back to `env.wasm` → wasm, else cpu.
 */
export declare function defaultExecutionProviders(ort: unknown): string[];
/**
 * pthread init hangs in workers without COOP/COEP. The demo ships single-thread
 * WASM, so default `numThreads = 1` unless the caller already set it.
 */
export declare function prepareOrtWasm(ort: unknown): void;
export interface ZipformerIoInput {
    name: string;
    dims: number[];
    dtype: string;
    /** Present on outputs the graph may omit. A missing tensor is not an error. */
    optional?: boolean;
}
export interface ZipformerIo {
    T: number;
    hop: number;
    featureDim: number;
    vocabSize: number;
    /**
     * Encoder-frame output (fp32 `[1, frames, 512]`), one row per `log_probs`
     * frame. Models that don't expose it leave this unset or simply don't
     * return the tensor; the slip head then stays off.
     */
    encoderFrames?: string;
    inputs: ZipformerIoInput[];
    outputs?: ZipformerIoInput[];
}
export declare class ZipformerRunner {
    readonly io: ZipformerIo;
    leftoverFrames: number;
    processedLens: bigint;
    private readonly session;
    private readonly Tensor;
    private readonly buffer;
    private states;
    private readonly stateNames;
    private constructor();
    static create(ort: unknown, model: Uint8Array | ArrayBuffer, io: ZipformerIo, executionProviders?: string[]): Promise<ZipformerRunner>;
    static fromSession(session: OrtSessionLike, io: ZipformerIo, Tensor: OrtLike["Tensor"]): ZipformerRunner;
    reset(): void;
    accept(frames: Float32Array[]): Promise<{
        logProbs: Float32Array;
        frames: number;
        /** Encoder rows, row-major `[encoderFrames, 512]`. Absent when the model has no such output. */
        encoder?: Float32Array;
        encoderFrames?: number;
    }>;
    private initStates;
}
