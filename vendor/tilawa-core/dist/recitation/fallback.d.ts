import { QuranCorpus } from "./corpus.js";
import { type CostTable } from "./phonemeCost.js";
import type { FallbackHit } from "./types.js";
export declare function wholeAyahFallback(text: string, corpus: QuranCorpus, table?: CostTable, minChars?: number, maxDistance?: number): FallbackHit | null;
