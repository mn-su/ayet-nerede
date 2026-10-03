/** Longest transcript (phoneme characters) searched at once. About 25–30 s of
 * recitation; longer clips are identified from their first part. */
export const IDENTIFY_MAX_CHARS = 400;
export const IDENTIFY_DEFAULT_TOP_K = 5;
/** Distances this close count as a tie (identical or near-identical text). */
const TIE_DISTANCE = 0.01;
function round2(x) {
    return Math.round(x * 100) / 100;
}
function surahNames(deps, surah) {
    const rec = deps.corpus.surahs.find((s) => s.n === surah);
    return { ar: rec?.name ?? "", en: rec?.nameEn ?? "" };
}
function candidate(deps, surah, ayah, word, ayahEnd, wordEnd, distance, how) {
    const names = surahNames(deps, surah);
    const verse = deps.quran?.getVerse(surah, ayah);
    return {
        surah,
        ayah,
        word,
        ayahEnd,
        wordEnd,
        distance: round2(distance),
        confidence: round2(Math.min(1, Math.max(0, 1 - distance))),
        how,
        surah_name: verse?.surah_name || names.ar,
        surah_name_en: verse?.surah_name_en || names.en,
        verse_text: verse?.text_uthmani ?? "",
    };
}
function fromHit(deps, h) {
    const { corpus } = deps;
    const last = corpus.wordAt(Math.max(h.refOffset, h.refEnd - 1));
    return candidate(deps, h.surah, h.ayah, h.word, corpus.wordAyah[last], corpus.wordInAyah[last], h.distance, "search");
}
/**
 * Rank the places in the Quran a phoneme transcript could come from.
 * Pure: no ONNX, no session state — `ZipformerSession.identify` decodes the
 * audio and calls this.
 */
export function identifyTranscript(transcript, deps, opts = {}) {
    const topK = Math.max(1, Math.floor(opts.topK ?? IDENTIFY_DEFAULT_TOP_K));
    const truncated = transcript.length > IDENTIFY_MAX_CHARS;
    const text = truncated ? transcript.slice(0, IDENTIFY_MAX_CHARS) : transcript;
    const empty = { candidates: [], tied: 0, decisive: false, transcript: text, truncated };
    if (!text)
        return empty;
    // Ask for more hits than shown: a duplicate of the same ayah (two windows
    // in one long ayah) must not push a distinct rival out, and ties with the
    // best hit past `topK` are kept.
    const cap = topK * 2;
    const res = deps.index.search(text, null, cap + 3);
    const best = res.hits[0]?.distance ?? Infinity;
    const seen = new Set();
    const candidates = [];
    for (const h of res.hits) {
        const key = `${h.surah}:${h.ayah}`;
        if (seen.has(key))
            continue;
        if (candidates.length >= topK && h.distance > best + TIE_DISTANCE)
            break;
        if (candidates.length >= cap)
            break;
        seen.add(key);
        candidates.push(fromHit(deps, h));
    }
    const tied = res.hits.filter((h, i, all) => h.distance <= best + TIE_DISTANCE &&
        all.findIndex((o) => o.surah === h.surah && o.ayah === h.ayah) === i).length;
    if (candidates.length === 0 && deps.fallback) {
        const fb = deps.fallback(text);
        if (fb) {
            const words = deps.corpus.ayahWordCount(fb.surah, fb.ayah);
            candidates.push(candidate(deps, fb.surah, fb.ayah, 0, fb.ayah, Math.max(0, words - 1), fb.distance, fb.how));
            // A lone basmala opens 113 surahs, and a whole-ayah match of a very
            // short clip is a guess: never call either decisive.
            return { candidates, tied: 1, decisive: false, transcript: text, truncated };
        }
    }
    return {
        candidates,
        tied: Math.min(tied, candidates.length),
        decisive: res.decisive && candidates.length > 0,
        transcript: text,
        truncated,
    };
}
