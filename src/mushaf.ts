/** Diyanet mushaf data built by scripts/build-data.mjs. */
export interface MushafData {
  surahs: { tr: string; ar: string; ayahs: number }[];
  /** [page, juz, firstSurah, firstAyah, lastSurah, lastAyah] */
  pages: [number, number, number, number, number, number][];
  /** text[surah - 1][ayah - 1] */
  text: string[][];
}

export interface PageAyah {
  surah: number;
  ayah: number;
  text: string;
}

export interface MushafPage {
  page: number;
  juz: number;
  ayahs: PageAyah[];
}

export class Mushaf {
  private readonly pageOf = new Map<string, number>();
  readonly firstPage: number;
  readonly lastPage: number;

  constructor(readonly data: MushafData) {
    for (const [page, , s1, a1, s2, a2] of data.pages) {
      for (let s = s1; s <= s2; s++) {
        const from = s === s1 ? a1 : 1;
        const to = s === s2 ? a2 : data.surahs[s - 1]!.ayahs;
        for (let a = from; a <= to; a++) this.pageOf.set(`${s}:${a}`, page);
      }
    }
    this.firstPage = data.pages[0]![0];
    this.lastPage = data.pages.at(-1)![0];
  }

  pageFor(surah: number, ayah: number): number | undefined {
    return this.pageOf.get(`${surah}:${ayah}`);
  }

  page(page: number): MushafPage | undefined {
    const row = this.data.pages.find((p) => p[0] === page);
    if (!row) return undefined;
    const [, juz, s1, a1, s2, a2] = row;
    const ayahs: PageAyah[] = [];
    for (let s = s1; s <= s2; s++) {
      const from = s === s1 ? a1 : 1;
      const to = s === s2 ? a2 : this.data.surahs[s - 1]!.ayahs;
      for (let a = from; a <= to; a++) ayahs.push({ surah: s, ayah: a, text: this.data.text[s - 1]![a - 1]! });
    }
    return { page, juz, ayahs };
  }

  surahName(surah: number): string {
    return this.data.surahs[surah - 1]?.tr ?? String(surah);
  }

  surahNameAr(surah: number): string {
    return this.data.surahs[surah - 1]?.ar ?? "";
  }

  /** The basmala as written in this mushaf (1:1). */
  get basmala(): string {
    return this.data.text[0]![0]!;
  }
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const arabicNumber = (n: number): string => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]!);
