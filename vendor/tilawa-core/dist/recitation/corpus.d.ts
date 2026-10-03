import type { SurahRecord } from "./types.js";
export declare class QuranCorpus {
    readonly text: string;
    readonly wordStart: Int32Array;
    readonly wordSurah: Int32Array;
    readonly wordAyah: Int32Array;
    readonly wordInAyah: Int32Array;
    readonly mushaf: string[];
    readonly plain: string[];
    readonly ayahFirst: Int32Array[];
    readonly ayahWords: Int32Array[];
    readonly markers: string[][];
    readonly surahs: SurahRecord[];
    readonly wordCount: number;
    constructor(data: unknown);
    wordAt(offset: number): number;
    wordIndex(surah: number, ayah: number, word: number): number;
    hasAyah(surah: number, ayah: number): boolean;
    ayahFirstWord(surah: number, ayah: number): number;
    ayahWordCount(surah: number, ayah: number): number;
    ayahPhonemes(surah: number, ayah: number): string;
    wordPhonemes(wordIndex: number): string;
}
