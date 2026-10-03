import { normalizeArabic } from "./normalizer.js";
function refKey(surah, ayah, ayahEnd = ayah) {
    return `${surah}:${ayah}:${ayahEnd}`;
}
function wordsFromText(text) {
    return text.split(/\s+/).filter(Boolean);
}
export function adaptQuranTextData(verses, ctcTokens, decoder) {
    return verses.map((verse) => {
        const clean = normalizeArabic(verse.text_clean ?? verse.text_uthmani);
        const tokenIds = ctcTokens[refKey(verse.surah, verse.ayah)] ?? [];
        const decoded = decoder.tokenIdsToText(tokenIds);
        const joined = decoded || clean;
        const words = wordsFromText(joined);
        return {
            ...verse,
            text_clean: clean,
            phonemes: joined,
            phonemes_joined: joined,
            phoneme_tokens: decoder.tokenIdsToRawTokens(tokenIds),
            phoneme_tokens_no_bsm: null,
            phoneme_token_ids: tokenIds,
            phoneme_token_ids_no_bsm: null,
            word_token_ends: decoder.tokenIdsToWordEnds(tokenIds),
            phonemes_joined_no_bsm: null,
            phonemes_joined_ns: joined.replace(/ /g, ""),
            phonemes_joined_no_bsm_ns: null,
            phoneme_words: words,
        };
    });
}
export function validateCtcTokenRoundTrip(verses, decoder, sampleSize = 24) {
    const errors = [];
    const step = Math.max(1, Math.floor(verses.length / sampleSize));
    for (let i = 0; i < verses.length; i += step) {
        const verse = verses[i];
        const ids = verse.phoneme_token_ids ?? [];
        if (!ids.length) {
            errors.push(`${verse.surah}:${verse.ayah} has no CTC token ids`);
            continue;
        }
        const decoded = decoder.tokenIdsToText(ids);
        const expected = normalizeArabic(verse.text_clean ?? verse.text_uthmani);
        if (decoded && expected && decoded !== expected) {
            errors.push(`${verse.surah}:${verse.ayah} token decode mismatch`);
        }
    }
    return errors;
}
