import { QuranDB } from "./quran-db.js";
import { RecitationTracker } from "./tracker.js";
import { TextCTCDecoder } from "./text-ctc-decode.js";
import { adaptQuranTextData, validateCtcTokenRoundTrip, } from "./quran-text-adapter.js";
import { DEFAULT_STREAMING_CONFIG, normalizeStreamingConfig, SAMPLE_RATE, } from "./types.js";
import { ZipformerSession, } from "./recitation/session.js";
// The default recognition path: streaming Zipformer2-CTC over tajweed phonemes.
export * from "./recitation/index.js";
// Full config + type surface for app developers.
export * from "./types.js";
export { QuranDB } from "./quran-db.js";
export { TextCTCDecoder } from "./text-ctc-decode.js";
export { RecitationTracker } from "./tracker.js";
export { adaptQuranTextData, validateCtcTokenRoundTrip } from "./quran-text-adapter.js";
const CHAMPION_TRUST_THRESHOLD = 0.8;
/**
 * Wire the pure-TS core (CTC decode + QuranDB + tracker) to an injected
 * `SessionRunner`. Reproduces the init()/transcribe() glue from the web worker
 * without any onnxruntime dependency.
 */
const FASTCONFORMER_ASSET_LABELS = [
    ["vocab", "vocab"],
    ["quranCtcTokens", "ctcTokens"],
    ["quran", "quran"],
];
/** Missing FastConformer asset keys, using the public names (`ctcTokens` not `quranCtcTokens`). */
export function missingFastConformerAssets(assets) {
    const rec = assets && typeof assets === "object" ? assets : {};
    const missing = [];
    for (const [field, label] of FASTCONFORMER_ASSET_LABELS) {
        if (rec[field] == null)
            missing.push(label);
    }
    return missing;
}
function assertFastConformerAssets(assets) {
    const missing = missingFastConformerAssets(assets);
    if (missing.length > 0) {
        throw new Error(`fastconformer engine requires assets: ${missing.join(", ")} ...`);
    }
}
export function createTilawaSession(runner, assets, options = {}) {
    assertFastConformerAssets(assets);
    const decoder = new TextCTCDecoder(assets.vocab, assets.blankId ?? 1024);
    const quranData = adaptQuranTextData(assets.quran, assets.quranCtcTokens, decoder);
    const tokenErrors = validateCtcTokenRoundTrip(quranData, decoder);
    if (tokenErrors.length > 0) {
        options.onDiagnostic?.("ctc_token_roundtrip", { errors: tokenErrors.slice(0, 8) });
    }
    const db = new QuranDB(quranData, undefined, assets.quranCtcTokens);
    let activeConfig = normalizeStreamingConfig(options.config ?? DEFAULT_STREAMING_CONFIG);
    const postDebug = (event, data) => {
        options.onDiagnostic?.(event, data);
    };
    const transcribe = async (audio) => {
        const { logprobs, timeSteps, vocabSize } = await runner.run(audio);
        const greedy = decoder.decode(logprobs, timeSteps, vocabSize);
        const champion = db.bestJoint03Match(greedy.text);
        postDebug("transcribe", {
            audioSec: Math.round((audio.length / 16000) * 100) / 100,
            text: greedy.text,
            tokenCount: greedy.tokenIds.length,
            champion: champion
                ? {
                    ref: `${champion.surah}:${champion.ayah}` +
                        (champion.ayah_end ? `-${champion.ayah_end}` : ""),
                    score: champion.score,
                }
                : null,
        });
        const trustedChampion = champion?.score && champion.score >= CHAMPION_TRUST_THRESHOLD ? champion : null;
        return {
            text: greedy.text,
            rawPhonemes: greedy.text,
            tokenIds: greedy.tokenIds,
            acoustic: {
                logprobs,
                timeSteps,
                vocabSize,
                blankId: decoder.getBlankId(),
            },
            championMatch: trustedChampion ?? undefined,
        };
    };
    const makeTracker = () => new RecitationTracker(db, transcribe, {
        config: activeConfig,
        onDiagnostic: (event) => postDebug("tracker", { ...event }),
    });
    let tracker = makeTracker();
    return {
        db,
        decoder,
        async transcribe(audio) {
            const result = await transcribe(audio);
            const m = result.championMatch;
            if (!m) {
                return { surah: 0, ayah: 0, ayah_end: null, score: 0, transcript: result.text };
            }
            return {
                surah: m.surah,
                ayah: m.ayah,
                ayah_end: m.ayah_end ?? null,
                score: m.score,
                transcript: result.text,
            };
        },
        transcribeRaw: transcribe,
        async feed(audioChunk) {
            const messages = await tracker.feed(audioChunk);
            for (const msg of messages)
                options.onOutput?.(msg);
            return messages;
        },
        reset() {
            tracker = makeTracker();
        },
        setConfig(config) {
            activeConfig = normalizeStreamingConfig(config);
            tracker.setConfig(activeConfig);
            postDebug("config", activeConfig);
        },
        getConfig() {
            return activeConfig;
        },
    };
}
/** Zipformer is the default: better accuracy, no text-CTC assets to ship. */
export const DEFAULT_ENGINE = "zipformer";
/**
 * Create a recognition session for either engine.
 *
 * Defaults to `"zipformer"` — the streaming phoneme engine. Pass
 * `engine: "fastconformer"` with a `SessionRunner` plus text-CTC assets
 * for the original pipeline. Missing FastConformer assets throw before use.
 */
export async function createRecognitionSession(options) {
    if (options.engine === "fastconformer") {
        const { engine, runner, assets, ...rest } = options;
        assertFastConformerAssets(assets);
        if (!runner) {
            throw new Error("fastconformer engine requires a SessionRunner");
        }
        const session = createTilawaSession(runner, assets, rest);
        const flush = async () => {
            // The FastConformer tracker finalizes on trailing silence; give it enough
            // to trip `finalSilenceSec` so `final_sequence` lands.
            const seconds = session.getConfig().finalSilenceSec + 0.2;
            return session.feed(new Float32Array(Math.round(seconds * SAMPLE_RATE)));
        };
        return {
            engine,
            feed: (chunk) => session.feed(chunk),
            stop: flush,
            flush,
            reset: () => session.reset(),
            zipformer: null,
            fastconformer: session,
        };
    }
    const { engine: _engine, ...zipformerOptions } = options;
    const session = await ZipformerSession.create(zipformerOptions);
    return {
        engine: "zipformer",
        feed: (chunk) => session.feed(chunk),
        stop: () => session.stop(),
        flush: () => session.flush(),
        reset: () => void session.reset(),
        zipformer: session,
        fastconformer: null,
    };
}
