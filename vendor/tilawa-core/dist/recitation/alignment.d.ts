import { type CostTable } from "./phonemeCost.js";
export interface SemiGlobalResult {
    cost: number;
    distance: number;
    refStart: number;
    refEnd: number;
    queryStart: number;
}
export declare function weightedLevenshtein(a: Uint8Array, b: Uint8Array, table: CostTable): number;
export declare function normalizedDistance(a: Uint8Array, b: Uint8Array, table: CostTable): number;
export declare function alignGlobal(heard: Uint8Array, ref: Uint8Array, from: number, to: number, table: CostTable): Int32Array;
export declare function alignSemiGlobal(query: Uint8Array, ref: Uint8Array, from: number, to: number, table: CostTable, headSkipCost?: number): SemiGlobalResult;
