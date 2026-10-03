import type { QuranVerse } from "./types.js";
import { TextCTCDecoder } from "./text-ctc-decode.js";
export type CtcTokenTable = Record<string, number[]>;
interface RawQuranVerse {
    surah: number;
    ayah: number;
    text_uthmani: string;
    text_clean?: string;
    surah_name: string;
    surah_name_en: string;
}
export declare function adaptQuranTextData(verses: RawQuranVerse[], ctcTokens: CtcTokenTable, decoder: TextCTCDecoder): QuranVerse[];
export declare function validateCtcTokenRoundTrip(verses: readonly QuranVerse[], decoder: TextCTCDecoder, sampleSize?: number): string[];
export {};
