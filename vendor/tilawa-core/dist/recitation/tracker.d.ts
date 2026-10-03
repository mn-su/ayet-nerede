import { type EngineConfig } from "./config.js";
import type { QuranCorpus } from "./corpus.js";
import type { CostTable } from "./phonemeCost.js";
import type { HeardChar } from "./types.js";
export declare class Tracker {
    readonly corpus: QuranCorpus;
    readonly table: CostTable;
    readonly cfg: EngineConfig;
    readonly surah: number;
    readonly firstWord: number;
    readonly endWord: number;
    readonly len: number;
    readonly surahStart: number;
    readonly ref: Uint8Array;
    readonly wordStarts: Int32Array;
    readonly ayahAtStart: Int32Array;
    readonly localWordOfPos: Int32Array;
    readonly startLocal: number;
    /** Per word: extra jump cost into it (0 inside the expected window). */
    readonly jumpExtra: Float32Array;
    column: Float32Array;
    cursorCell: number;
    cursorLocalWord: number;
    cursorCost: number;
    revision: number;
    readonly trail: number[];
    readonly costs: number[];
    readonly heard: HeardChar[];
    lost: boolean;
    private readonly snapshots;
    constructor(corpus: QuranCorpus, table: CostTable, surah: number, startWordIndex: number, cfg?: EngineConfig, window?: {
        firstWord: number;
        endWord: number;
    } | null);
    get cursorWordIndex(): number;
    get reachedEnd(): boolean;
    feed(chars: readonly HeardChar[]): void;
    costRate(window?: number): number | null;
    retract(n: number): void;
    private resetColumn;
    private restore;
    private feedOne;
}
