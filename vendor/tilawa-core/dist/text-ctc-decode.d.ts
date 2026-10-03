export interface TextCTCResult {
    text: string;
    rawPhonemes: string;
    tokenIds: number[];
}
export declare class TextCTCDecoder {
    private vocab;
    private blankId;
    constructor(vocabJson: Record<string, string>, blankId?: number);
    decode(logprobs: Float32Array, timeSteps: number, vocabSize: number): TextCTCResult;
    getBlankId(): number;
    tokenIdsToText(tokenIds: readonly number[]): string;
    tokenIdsToRawTokens(tokenIds: readonly number[]): string[];
    tokenIdsToWordEnds(tokenIds: readonly number[]): number[];
}
