import { normalizeArabic } from "./normalizer.js";
const WORD_PREFIX = "\u2581";
export class TextCTCDecoder {
    vocab;
    blankId;
    constructor(vocabJson, blankId) {
        this.vocab = new Map();
        let maxId = 0;
        for (const [id, token] of Object.entries(vocabJson)) {
            const numId = Number(id);
            this.vocab.set(numId, token);
            maxId = Math.max(maxId, numId);
        }
        this.blankId = blankId ?? maxId;
    }
    decode(logprobs, timeSteps, vocabSize) {
        const frameIds = [];
        for (let t = 0; t < timeSteps; t++) {
            const offset = t * vocabSize;
            let maxIdx = 0;
            let maxVal = logprobs[offset];
            for (let v = 1; v < vocabSize; v++) {
                const value = logprobs[offset + v];
                if (value > maxVal) {
                    maxVal = value;
                    maxIdx = v;
                }
            }
            frameIds.push(maxIdx);
        }
        const tokenIds = [];
        let previous = -1;
        for (const id of frameIds) {
            if (id !== previous && id !== this.blankId) {
                tokenIds.push(id);
            }
            previous = id;
        }
        const text = this.tokenIdsToText(tokenIds);
        return {
            text,
            rawPhonemes: text,
            tokenIds,
        };
    }
    getBlankId() {
        return this.blankId;
    }
    tokenIdsToText(tokenIds) {
        const joined = tokenIds
            .filter((id) => id !== this.blankId)
            .map((id) => this.vocab.get(id) ?? "")
            .filter((token) => token && token !== "<unk>" && token !== "<blank>")
            .join("")
            .replaceAll(WORD_PREFIX, " ");
        return normalizeArabic(joined).trim();
    }
    tokenIdsToRawTokens(tokenIds) {
        return tokenIds
            .filter((id) => id !== this.blankId)
            .map((id) => this.vocab.get(id) ?? "")
            .filter((token) => token && token !== "<unk>");
    }
    tokenIdsToWordEnds(tokenIds) {
        const tokens = this.tokenIdsToRawTokens(tokenIds);
        const ends = [];
        let inWord = false;
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (token === WORD_PREFIX || token.startsWith(WORD_PREFIX)) {
                if (inWord)
                    ends.push(i);
                inWord = token !== WORD_PREFIX;
                continue;
            }
            inWord = true;
        }
        if (inWord)
            ends.push(tokens.length);
        return ends.filter((end, idx) => idx === 0 || end > ends[idx - 1]);
    }
}
