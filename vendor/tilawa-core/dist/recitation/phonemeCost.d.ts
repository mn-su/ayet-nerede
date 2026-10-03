export declare const ALPHABET = "\u0621\u0627\u0628\u062A\u062B\u062C\u062D\u062E\u062F\u0630\u0631\u0632\u0633\u0634\u0635\u0636\u0637\u0638\u0639\u063A\u0641\u0642\u0643\u0644\u0645\u0646\u0647\u0648\u064A\u06E5\u06E6\u06BA\u06FE\u0672\u0623\u0625\u0622\u0624\u0626\u0671\u0649\u064E\u064F\u0650\u0687\u0619\u06E3\u065E\u06DC\u06EA\u0640";
export declare const ALPHABET_SIZE = 51;
export declare const TABLE_SIZE = 52;
export declare const UNKNOWN_ID = 51;
export declare const INSERT_DELETE_COST = 1;
export declare function charId(ch: string): number;
export declare function canonical(ch: string): string;
export declare function charCost(heard: string, expected: string): number;
export declare class CostTable {
    readonly size = 52;
    readonly unknownId = 51;
    readonly matrix: Float32Array;
    constructor();
    id(ch: string): number;
    encode(text: string): Uint8Array;
    cost(heardId: number, expectedId: number): number;
}
export declare function costTable(): CostTable;
