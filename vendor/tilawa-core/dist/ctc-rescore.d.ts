export interface AcousticEvidence {
    logprobs: Float32Array;
    timeSteps: number;
    vocabSize: number;
    blankId: number;
}
export interface CtcCandidate<T = unknown> {
    ids: number[];
    meta: T;
    priorScore?: number;
}
export interface ScoredCtcCandidate<T = unknown> extends CtcCandidate<T> {
    acousticScore: number;
    feasible: boolean;
    minFramesRequired: number;
}
export declare function minFramesRequired(ids: readonly number[]): number;
export declare function scoreCtcSequence(evidence: AcousticEvidence, ids: readonly number[]): number;
export declare function scoreCtcCandidates<T>(evidence: AcousticEvidence, candidates: readonly CtcCandidate<T>[]): ScoredCtcCandidate<T>[];
export declare function chooseLongestStablePrefix<T>(scored: readonly ScoredCtcCandidate<T>[], tolerance?: number): ScoredCtcCandidate<T> | null;
