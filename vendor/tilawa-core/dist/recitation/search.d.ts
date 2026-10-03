import { type EngineConfig } from "./config.js";
import { QuranCorpus } from "./corpus.js";
import { type CostTable } from "./phonemeCost.js";
import type { SearchHint, SearchResult, StripResult } from "./types.js";
export declare const ISTIADHA = "\u0621\u064E\u0639\u064F\u06E5\u06E5\u0630\u064F\u0628\u0650\u0644\u0644\u064E\u0627\u0627\u0647\u0650\u0645\u0650\u0646\u064E\u0634\u0634\u064E\u064A\u064A\u0637\u064E\u0627\u0627\u0646\u0650\u0631\u0631\u064E\u062C\u0650\u06E6\u06E6\u0645";
export declare const BASMALA = "\u0628\u0650\u0633\u0645\u0650\u0644\u0644\u064E\u0627\u0627\u0647\u0650\u0631\u0631\u064E\u062D\u0645\u064E\u0627\u0627\u0646\u0650\u0631\u0631\u064E\u062D\u0650\u06E6\u06E6\u06E6\u06E6\u0645";
export declare function fnv1aBucket(ids: ArrayLike<number>, at: number): number;
export declare function stripPreambles(query: string, table: CostTable): StripResult;
/** True while `rest` could still grow into an isti'adha or basmala. */
export declare function preamblePending(rest: string, table: CostTable): boolean;
export declare class QuranIndex {
    readonly corpus: QuranCorpus;
    readonly table: CostTable;
    private readonly cfg;
    private readonly sep;
    private readonly surahSepStart;
    private readonly surahSepLen;
    private readonly surahCorpusStart;
    private readonly bucketStart;
    private readonly postings;
    constructor(corpus: QuranCorpus, cfg?: EngineConfig, table?: CostTable);
    search(query: string, hint?: SearchHint | null, limit?: number): SearchResult;
    private searchSlice;
    private applyHint;
    private isDecisive;
    private rival;
    private mapSep;
}
