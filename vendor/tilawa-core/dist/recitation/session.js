/**
 * `ZipformerSession` — the default recognition path of `@tilawa/core`.
 *
 * Streaming phoneme pipeline: 16 kHz PCM -> Kaldi fbank (80 mel) -> streaming
 * Zipformer2-CTC (251 tajweed-phoneme tokens) -> greedy CTC -> whole-Quran
 * n-gram search + per-surah online DP tracker -> per-word verdicts -> the
 * SDK's verse events (`emission.ts`).
 *
 * Runtime-agnostic: ONNX arrives through the same injection seam as
 * `SessionRunner` — either a whole `ort`-like namespace plus model bytes, or an
 * already-created session plus that runtime's `Tensor` constructor (the shape
 * React Native needs, where `InferenceSession.create` takes a file path).
 */
import { QuranDB } from "../quran-db.js";
import { SURROUNDING_CONTEXT } from "../types.js";
import { accumulateSnapshot, ayahConfidence, ayahKey, ayahMeetsGate, bridgeGapAyahs, buildFinalSequence, FALLBACK_MAX_DISTANCE, GAP_MAX_WORDS, mergeTallies, MIN_WORD_FRACTION, newlyEligibleAyahs, shouldRunFallback, snapshotTallies, wordProgressFromCursor, } from "./emission.js";
import { DEFAULT_CONFIG, SAMPLE_RATE } from "./config.js";
import { GreedyCtcDecoder } from "./ctcDecoder.js";
import { KaldiFbank } from "./fbank.js";
import { QuranCorpus } from "./corpus.js";
import { QuranIndex, stripPreambles } from "./search.js";
import { identifyTranscript, IDENTIFY_MAX_CHARS } from "./identify.js";
import { RecitationEngine } from "./engine.js";
import { BLANK_ID, TOKENS } from "./tokens.js";
import { costTable } from "./phonemeCost.js";
import { normalizedDistance } from "./alignment.js";
import { ZipformerRunner, } from "./zipformerRunner.js";
import DEFAULT_IO from "./zipformer-io.json" with { type: "json" };
import { CorrectionController } from "./correction.js";
import { FramePosteriors } from "./posteriors.js";
import { A0W_SLIP_HEAD, EncoderFrames, slipThreshold } from "./slipHead.js";
import { AYAH_ORDER_PARAMS, AYAH_ORDER_RULE, AYAH_ORDER_RULE_GUARDED, SIMILAR_VERSE_RULE, StructuralRules, ayahOrderFlags, similarVerseEligible, similarVersePick, } from "./structural.js";
const TAIL_SECONDS = 2.0;
/** Mean heard ratio over an unmatched ayah's words at or above which the gap
 * counts as heard-but-unfollowed (`unclear_ayah`) rather than skipped. */
export const AYAH_HEARD_FRACTION = 0.5;
const SKIP_PERSIST_FRAMES = 12;
/** I/O manifest of the default `zipformer_a0w_ep1_a05.int8.onnx` (its encoder-frame
 * output is optional, so the same manifest drives `zipformer_interp_gentle_a05.int8.onnx`). */
export const DEFAULT_ZIPFORMER_IO = DEFAULT_IO;
async function resolveSource(src) {
    return typeof src === "function" ? src() : src;
}
/**
 * Build the display-text `QuranDB` from raw `quran.json` rows. The Zipformer
 * path never reads the text-CTC fields, so they default to empty.
 */
export function displayQuranFromRaw(raw) {
    if (!Array.isArray(raw))
        throw new Error("quran.json must be an array");
    return new QuranDB(raw.map((row) => {
        const v = row;
        return {
            ...v,
            phonemes: v.phonemes ?? "",
            phonemes_joined: v.phonemes_joined ?? "",
            phoneme_words: v.phoneme_words ?? [],
        };
    }));
}
async function resolveQuranDb(src) {
    if (!src)
        return displayQuranFromRaw([]);
    const resolved = await resolveSource(src);
    return resolved instanceof QuranDB ? resolved : displayQuranFromRaw(resolved);
}
function surroundingVerses(db, surah, ayah) {
    return db.getSurah(surah)
        .filter((v) => Math.abs(v.ayah - ayah) <= SURROUNDING_CONTEXT)
        .map((v) => ({
        surah: v.surah,
        ayah: v.ayah,
        text: v.text_uthmani,
        is_current: v.ayah === ayah,
    }));
}
/** Both structural rules, run once over the take at `stop()`. */
export const DEFAULT_STRUCTURAL = { ayahOrder: true, similarVerse: true, timing: "stop" };
/** Audio after which the structural rules start a new block (bounds their cost). */
const STRUCTURAL_BLOCK_SECONDS = 120;
const STRUCTURAL_ERROR_KINDS = new Set(["possible_omission", "possible_substitution", "possible_vowel",
    "possible_skipped_ayah", "unclear_ayah"]);
async function loadStructuralIndex() {
    const mod = await import("./structural-index.json", { with: { type: "json" } });
    return mod.default;
}
export class ZipformerSession {
    corpus;
    index;
    table = costTable();
    ayahIds = [];
    quranDb;
    runner;
    cfg;
    tailSeconds;
    minWordFraction;
    stayOnSurah;
    enableFallback;
    fallbackMaxDistance;
    allowGaps;
    gapMaxWords;
    onEvent;
    fbank = new KaldiFbank();
    decoder = new GreedyCtcDecoder(TOKENS, BLANK_ID);
    posteriors;
    encoderFrames = new EncoderFrames();
    slipWeights = A0W_SLIP_HEAD;
    /** Requested sensitivity. False until the caller turns the head on. */
    slipMode = false;
    /** Flips off, silently, when a producing chunk has no encoder frames. */
    slipLive = true;
    engine;
    accumulated = new Map();
    emitted = new Set();
    transcriptParts = [];
    lastCursor = null;
    /** Last `verse_match` emitted by the current tracker lock. Cleared on
     * locate / relocate / lost so an ayah gap across a jump never flags. */
    lastMatch = null;
    ayahIssuesRaised = new Set();
    correction = new CorrectionController();
    practiceEngine = null;
    expected = null;
    skipCandidate = null;
    stopping = false;
    structuralRules = null;
    aoRule = null;
    svOn = false;
    svNearSkip = true;
    structuralLive = false;
    st = ZipformerSession.freshStructural();
    lastFallback = null;
    debugEnabled = false;
    /** Set while `identify()` runs: its decode must not reach `onEvent`. */
    quiet = false;
    constructor(runner, corpusJson, quranDb, opts) {
        this.runner = runner;
        this.quranDb = quranDb;
        this.cfg = { ...DEFAULT_CONFIG, ...opts.config };
        this.tailSeconds = opts.tailSeconds ?? TAIL_SECONDS;
        this.minWordFraction = opts.minWordFraction ?? MIN_WORD_FRACTION;
        this.stayOnSurah = opts.stayOnSurah ?? false;
        this.enableFallback = opts.enableFallback ?? true;
        this.fallbackMaxDistance = opts.fallbackMaxDistance ?? FALLBACK_MAX_DISTANCE;
        this.allowGaps = opts.allowGaps ?? false;
        this.gapMaxWords = opts.gapMaxWords ?? GAP_MAX_WORDS;
        this.onEvent = opts.onEvent ?? null;
        this.debugEnabled = opts.debug ?? false;
        this.slipMode = opts.slipHead === true || opts.slipHead === "strict" ? "strict"
            : opts.slipHead === "high" ? "high" : false;
        this.posteriors = new FramePosteriors(runner.io.vocabSize);
        this.corpus = new QuranCorpus(corpusJson);
        this.index = new QuranIndex(this.corpus, this.cfg);
        for (const s of this.corpus.surahs) {
            for (let a = 1; a <= s.ayahCount; a++) {
                const first = this.corpus.ayahFirstWord(s.n, a);
                const end = first + this.corpus.ayahWordCount(s.n, a);
                this.ayahIds.push({
                    surah: s.n,
                    ayah: a,
                    ids: this.table.encode(this.corpus.text.slice(this.corpus.wordStart[first], this.corpus.wordStart[end])),
                });
            }
        }
        this.engine = this.makeEngine();
    }
    static async create(opts) {
        const io = opts.io ? await resolveSource(opts.io) : DEFAULT_ZIPFORMER_IO;
        const corpusJson = await resolveSource(opts.corpus);
        const quranDb = await resolveQuranDb(opts.quran);
        let runner;
        if (opts.session) {
            if (!opts.Tensor) {
                throw new Error("ZipformerSession: `session` also needs the runtime's `Tensor`");
            }
            runner = ZipformerRunner.fromSession(opts.session, io, opts.Tensor);
        }
        else {
            if (!opts.ort || !opts.model) {
                throw new Error("ZipformerSession: pass `ort` + `model`, or `session` + `Tensor`");
            }
            const loaded = await resolveSource(opts.model);
            const bytes = loaded instanceof Uint8Array ? loaded : new Uint8Array(loaded);
            runner = await ZipformerRunner.create(opts.ort, bytes, io, opts.executionProviders);
        }
        const session = new ZipformerSession(runner, corpusJson, quranDb, opts);
        const structural = opts.structural === undefined ? DEFAULT_STRUCTURAL : opts.structural;
        if (structural)
            await session.setStructural(structural);
        return session;
    }
    /**
     * Turn the structural rules on or off (see {@link StructuralOptions}).
     * Loads the bundled look-alike index the first time a rule is turned on.
     */
    async setStructural(opts) {
        const ao = opts.ayahOrder ?? false;
        const sv = opts.similarVerse ?? false;
        if (!ao && !sv) {
            this.structuralRules = null;
            this.aoRule = null;
            this.svOn = false;
            this.st = ZipformerSession.freshStructural();
            return;
        }
        if (!this.structuralRules || opts.index) {
            this.structuralRules = new StructuralRules(this.corpus, opts.index ?? await loadStructuralIndex());
        }
        this.aoRule = ao === "guarded" ? AYAH_ORDER_RULE_GUARDED : ao ? AYAH_ORDER_RULE : null;
        this.svOn = sv;
        this.svNearSkip = opts.suppressNearSkip ?? true;
        this.structuralLive = opts.timing === "pause";
    }
    static freshStructural() {
        return {
            tokens: [],
            absFrames: 0,
            samples: 0,
            /** Tokens already seen by the last evaluation. */
            evalAt: 0,
            blockTok: 0,
            blockT0: 0,
            blockEmitted: new Set(),
            aoSeen: new Set(),
            /** Ayah-order flags found by the previous evaluation (pause timing). */
            aoLast: new Set(),
            svSeen: new Set(),
            skips: [],
            pending: [],
            issues: [],
            final: false,
        };
    }
    /** Every ayah the tracker has scored so far, in the order it first saw them. */
    get tallies() {
        return [...this.accumulated.values()].sort((a, b) => a.firstSeen - b.firstSeen);
    }
    /**
     * The ayahs that clear the emission gate — i.e. the ones `verse_match` was
     * emitted for. Bridges one short skipped ayah when `allowGaps` is set.
     */
    get verses() {
        const gated = this.tallies.filter((t) => ayahMeetsGate(t, this.minWordFraction));
        if (!this.allowGaps)
            return gated;
        return bridgeGapAyahs(gated, this.tallies, this.gapMaxWords);
    }
    /** Raw phoneme transcript accumulated since the last `reset()`. */
    get transcript() {
        return this.transcriptParts.join("");
    }
    /** `"searching"` until the engine locks onto a position, then `"tracking"`. */
    get engineState() {
        return this.engine.state;
    }
    /** Effective engine config (defaults merged with the constructor overrides). */
    get config() {
        return this.cfg;
    }
    /** Latest per-word acoustic verdicts of the active tracker (main or practice
     * engine). Empty before the recitation is located. Diagnostic use only. */
    verdicts() {
        const engine = this.practiceEngine ?? this.engine;
        return engine.tracer?.verdicts(false) ?? [];
    }
    /** Drop all state — new recitation, same model and corpus. */
    reset() {
        this.correction.reset();
        this.practiceEngine = null;
        this.accumulated = new Map();
        this.emitted = new Set();
        this.transcriptParts = [];
        this.lastCursor = null;
        this.lastMatch = null;
        this.ayahIssuesRaised = new Set();
        this.skipCandidate = null;
        this.lastFallback = null;
        this.st = ZipformerSession.freshStructural();
        this.resetDecoder();
        this.engine = this.makeEngine();
        return [];
    }
    /** Push one chunk of mono 16 kHz float32 PCM. Any size; 480 ms works well. */
    async feed(samples) {
        if (this.structuralRules)
            this.st.samples += samples.length;
        if (this.correction.state.phase === "error" || this.correction.state.phase === "corrected")
            return [];
        return this.dispatch(await this.feedSamples(samples));
    }
    /**
     * Identify a clip in one call: "which ayah is this?". Decodes `audio`
     * (mono 16 kHz float32), searches the whole Quran for the phonemes heard,
     * and returns up to `topK` ranked candidates.
     *
     * Unlike `feed()` + `stop()`, a clip that starts or ends mid-ayah is fine:
     * no share of the ayah's words has to be heard. Look-alike ayahs come back
     * side by side with `decisive: false`.
     *
     * Resets the session before and after, does not emit through `onEvent`, and
     * leaves the recitation mode as it was. Like `feed`/`stop`/`reset`, it must
     * not overlap another call on the same session. Clips longer than about
     * 30 s are identified from their start (`truncated: true`).
     */
    /**
     * Ranked candidates for what has been heard since the last `reset()`,
     * without stopping: the live counterpart of `identify()`. Call it between
     * `feed()` calls (cheap: a search over the current phoneme transcript, no
     * ONNX). The first answer is usually there 2–3 s in; each later call uses
     * everything heard so far, so the list firms up as the reciter goes on.
     * After `stop()` it also covers the flushed tail.
     *
     * Same result shape as `identify()`. It neither resets nor emits.
     */
    candidatesSoFar(opts = {}) {
        return identifyTranscript(this.transcript, {
            index: this.index,
            corpus: this.corpus,
            quran: this.quranDb,
            fallback: (text) => this.fallbackSearch(text),
        }, opts);
    }
    async identify(audio, opts = {}) {
        if (!(audio instanceof Float32Array)) {
            throw new TypeError("identify(): audio must be a Float32Array of mono 16 kHz samples");
        }
        const chunk = Math.max(1600, Math.floor(opts.chunkSamples ?? 4800));
        const mode = this.correction.mode;
        if (mode !== "tracking")
            this.setMode("tracking");
        this.reset();
        this.quiet = true;
        try {
            for (let i = 0; i < audio.length; i += chunk) {
                await this.feed(audio.subarray(i, i + chunk));
                if (this.transcriptParts.length > IDENTIFY_MAX_CHARS)
                    break;
            }
            await this.stop();
            return this.candidatesSoFar(opts);
        }
        finally {
            this.quiet = false;
            this.reset();
            if (mode !== "tracking")
                this.setMode(mode);
        }
    }
    /**
     * Correction mode: the passage the reciter is about to read (e.g. the ayahs
     * on screen). The tracker then locks onto it at once, stays inside it, and
     * cannot be pulled into a similar passage. Ignored in tracking mode. Kept
     * across {@link reset}; pass null to clear.
     */
    setExpected(passage) {
        this.expected = passage ? { ...passage } : null;
        this.engine.setExpected(this.expected);
    }
    setMode(mode) {
        const out = this.correction.state.phase !== 'idle' ? this.correct('close') : [];
        this.correction.setMode(mode);
        this.attachPosteriors(this.engine);
        if (this.practiceEngine)
            this.attachPosteriors(this.practiceEngine);
        return out;
    }
    /**
     * Turn the slip head on or off. `"strict"` is the no-extra-false-flag
     * cutoff; `"high"` is the sensitivity point. A model without encoder
     * frames keeps the head off either way.
     */
    setSlipHead(mode) {
        this.slipMode = mode;
        this.slipLive = true;
        this.attachPosteriors(this.engine);
        if (this.practiceEngine)
            this.attachPosteriors(this.practiceEngine);
    }
    correct(action) {
        if (!this.correction.act(action))
            return [];
        const state = this.correction.state;
        this.resetDecoder();
        if (state.phase === 'retrying') {
            this.practiceEngine = new RecitationEngine(this.corpus, this.index, this.cfg);
            this.practiceEngine.setStayOnSurah(true);
            this.attachPosteriors(this.practiceEngine);
            this.practiceEngine.track(state.issue.surah, state.issue.ayah, 0);
        }
        else {
            this.practiceEngine = null;
            if (state.phase === 'idle' && state.resume) {
                // Keep verse history, but discard pre-practice acoustic context.
                this.engine = this.makeEngine();
                this.engine.track(state.resume.surah, state.resume.ayah, state.resume.word);
                this.lastCursor = { ...state.resume };
            }
        }
        const out = [this.correctionMessage()];
        if (this.structuralRules && state.phase === 'idle')
            out.push(...this.raiseStructural());
        return this.dispatch(out);
    }
    correctionMessage() {
        const issue = this.correction.state.issue;
        return { type: 'correction', state: { ...this.correction.state },
            totalWords: issue ? this.wordCount(issue.surah, issue.ayah) : 0 };
    }
    /** Alias of {@link stop} — end of audio, flush the tail, emit the sequence. */
    async flush() {
        return this.stop();
    }
    async stop() {
        if (this.correction.state.phase !== "idle")
            return [];
        this.stopping = true;
        try {
            return await this.finish();
        }
        finally {
            this.stopping = false;
        }
    }
    async finish() {
        const out = [];
        const silence = new Float32Array(Math.round(this.tailSeconds * SAMPLE_RATE));
        out.push(...await this.feedSamples(silence));
        const frames = this.fbank.inputFinished();
        if (frames.length) {
            out.push(...await this.runFrames(frames));
        }
        const flushed = this.logTokens(this.decoder.flush(), this.st.absFrames - this.decoder.framesDecoded);
        if (flushed.length) {
            out.push(...this.consumeTokens(flushed));
        }
        out.push(...this.settleCorrection());
        this.dumpTallies();
        const live = newlyEligibleAyahs(this.accumulated, this.emitted, this.minWordFraction);
        for (const t of live) {
            this.emitted.add(ayahKey(t));
            out.push(this.toVerseMatch(t));
        }
        for (const t of live)
            out.push(...this.checkAyahGap(t));
        let fallback = null;
        if (this.enableFallback && shouldRunFallback([...this.emitted])) {
            fallback = this.fallbackSearch(this.transcript);
            this.lastFallback = fallback;
            if (fallback) {
                const words = this.corpus.ayahWordCount(fallback.surah, fallback.ayah);
                const tally = {
                    surah: fallback.surah,
                    ayah: fallback.ayah,
                    ok: words,
                    unsure: 0,
                    wrong: 0,
                    skipped: 0,
                    pending: 0,
                    words,
                    firstSeen: this.accumulated.size,
                };
                this.accumulated.set(ayahKey(tally), tally);
                if (!this.emitted.has(ayahKey(tally))) {
                    this.emitted.add(ayahKey(tally));
                    out.push(this.toVerseMatch(tally));
                }
                if (this.debugEnabled) {
                    out.push({
                        type: "debug",
                        event: "fallback",
                        at: Date.now(),
                        data: { ...fallback },
                    });
                }
            }
        }
        if (this.structuralRules) {
            this.st.final = true;
            out.push(...this.structuralTick(true));
        }
        const seq = buildFinalSequence([...this.accumulated.values()], fallback, this.minWordFraction);
        out.push({
            type: "final_sequence",
            verses: seq.verses,
            confidence: Math.round(seq.confidence * 100) / 100,
        });
        out.push({
            type: "raw_transcript",
            text: this.transcript,
            confidence: seq.confidence,
        });
        return this.dispatch(out);
    }
    makeEngine() {
        const engine = new RecitationEngine(this.corpus, this.index, this.cfg);
        engine.setStayOnSurah(this.stayOnSurah);
        engine.startSearch();
        engine.onBeforeRelocate = () => this.dumpTallies();
        this.attachPosteriors(engine);
        engine.setExpected(this.expected);
        return engine;
    }
    /** GOP scoring costs a few CTC Viterbi passes per word; only correction mode reads it.
     * The slip head is the same: tracking never sees `slip`. */
    attachPosteriors(engine) {
        const correction = this.correction.mode === "correction";
        engine.setPosteriors(correction ? this.posteriors : null);
        engine.setCorrection(correction);
        const slipOn = correction && this.slipMode !== false && this.slipLive;
        engine.setSlip(slipOn ? this.encoderFrames : null, slipOn ? this.slipWeights : null);
        const thr = slipOn ? slipThreshold(this.slipWeights, this.slipMode) : Infinity;
        if (this.correction.thresholds.slipFlag !== thr) {
            this.correction.thresholds = { ...this.correction.thresholds, slipFlag: thr };
        }
    }
    resetDecoder() {
        this.fbank.reset();
        this.decoder.reset();
        this.runner.reset();
        this.posteriors.clear(0);
        this.encoderFrames.clear(0);
        this.slipLive = true;
    }
    wordCount = (surah, ayah) => this.corpus.ayahWordCount(surah, ayah);
    dumpTallies() {
        const tracer = this.engine.tracer;
        if (!tracer)
            return;
        const snap = snapshotTallies(tracer.verdicts(true), this.wordCount);
        accumulateSnapshot(this.accumulated, snap);
    }
    currentSnapshot() {
        const tracer = this.engine.tracer;
        if (!tracer)
            return new Map();
        return snapshotTallies(tracer.verdicts(true), this.wordCount);
    }
    dispatch(messages) {
        if (this.structuralRules) {
            for (const msg of messages) {
                if (msg.type === "correction" && msg.state.phase === "error" && msg.state.issue)
                    this.st.issues.push(msg.state.issue);
            }
        }
        if (this.onEvent && !this.quiet)
            for (const msg of messages)
                this.onEvent(msg);
        return messages;
    }
    async feedSamples(samples) {
        const frames = this.fbank.acceptWaveform(samples);
        return this.runFrames(frames);
    }
    async runFrames(frames) {
        if (!frames.length)
            return [];
        const { logProbs, frames: out, encoder, encoderFrames } = await this.runner.accept(frames);
        if (out === 0)
            return [];
        this.posteriors.push(logProbs, out, this.decoder.framesDecoded);
        if (this.slipMode && this.slipLive) {
            if (encoder && encoderFrames) {
                this.encoderFrames.push(encoder, encoderFrames, this.decoder.framesDecoded);
            }
            else {
                // The graph has no encoder-frame output. Leave the rules as they were.
                this.slipLive = false;
                this.encoderFrames.clear(0);
                this.attachPosteriors(this.engine);
                if (this.practiceEngine)
                    this.attachPosteriors(this.practiceEngine);
            }
        }
        const base = this.st.absFrames - this.decoder.framesDecoded;
        const tokens = this.decoder.consume(logProbs, out, this.runner.io.vocabSize);
        if (this.structuralRules) {
            this.st.absFrames += out;
            this.logTokens(tokens, base);
        }
        return this.consumeTokens(tokens);
    }
    logTokens(tokens, base) {
        if (!this.structuralRules)
            return tokens;
        const t = this.st.samples / SAMPLE_RATE;
        for (const tok of tokens)
            this.st.tokens.push({ sym: tok.sym, frame: base + tok.frame, t });
        return tokens;
    }
    consumeTokens(tokens) {
        const out = [];
        if (this.practiceEngine) {
            this.practiceEngine.feed(tokens, this.decoder.framesDecoded);
            const engine = this.practiceEngine;
            const settled = !tokens.length && engine.tracker?.heard.length
                ? this.decoder.framesDecoded - engine.tracker.heard[engine.tracker.heard.length - 1].frame >= this.cfg.settleFrames : false;
            if (engine.tracer && engine.tracker && !engine.tracker.lost
                && (engine.tracker.costRate(this.cfg.holdWindow) ?? 0) < this.cfg.holdRate) {
                const raised = this.correction.observe(engine.tracer.verdicts(Boolean(settled)), this.correction.state.resume, this.decoder.framesDecoded);
                out.push(...this.noteMessages());
                if (raised)
                    out.push(this.correctionMessage());
            }
            else
                this.correction.clearEvidence();
            return out;
        }
        for (const t of tokens)
            this.transcriptParts.push(t.sym);
        for (const ev of this.engine.feed(tokens, this.decoder.framesDecoded)) {
            out.push(...this.handle(ev));
        }
        out.push(...this.emitNewMatches());
        const tracker = this.engine.tracker;
        if (!this.stopping && this.engine.tracer && tracker && !tracker.lost && this.lastCursor
            && (tracker.costRate(this.cfg.holdWindow) ?? 0) < this.cfg.holdRate) {
            const last = tracker.heard[tracker.heard.length - 1];
            const settled = !!last && this.decoder.framesDecoded - last.frame >= this.cfg.settleFrames;
            const raised = this.correction.observe(this.engine.tracer.verdicts(settled), this.lastCursor, this.decoder.framesDecoded);
            out.push(...this.noteMessages());
            if (raised) {
                // Retain main-session coverage before a practice exit replaces its tracker.
                this.dumpTallies();
                out.push(this.correctionMessage());
            }
            else
                out.push(...this.checkSkippedAyah(false));
        }
        else {
            this.correction.clearEvidence();
            this.skipCandidate = null;
        }
        if (this.structuralRules)
            out.push(...this.structuralTick(false));
        if (tokens.length) {
            out.push({
                type: "raw_transcript",
                text: this.transcript,
                confidence: 1,
            });
        }
        return out;
    }
    /**
     * Run the structural rules once a pause closes a segment (and at the end of
     * audio), then raise the next queued flag if the controller is idle.
     */
    structuralTick(final) {
        if (this.correction.mode !== "correction")
            return [];
        const st = this.st;
        if (final) {
            if (st.tokens.length)
                this.structuralEvaluate();
        }
        else if (this.structuralLive && st.tokens.length > st.evalAt) {
            const last = st.tokens[st.tokens.length - 1];
            const gap = AYAH_ORDER_PARAMS.gap;
            const pending = this.decoder.pendingFrame;
            const base = st.absFrames - this.decoder.framesDecoded;
            if (st.absFrames - last.frame >= gap && (pending === null || base + pending - last.frame >= gap)) {
                this.structuralEvaluate();
            }
        }
        return this.raiseStructural();
    }
    structuralVerses() {
        const st = this.st;
        let tallies;
        if (st.final) {
            tallies = this.verses;
            if (!tallies.length && this.lastFallback)
                return [[this.lastFallback.surah, this.lastFallback.ayah]];
        }
        else {
            tallies = [...mergeTallies(this.accumulated, this.currentSnapshot()).values()]
                .filter((t) => ayahMeetsGate(t, this.minWordFraction))
                .sort((a, b) => a.firstSeen - b.firstSeen);
        }
        const out = [];
        const seen = new Set();
        for (const t of tallies) {
            const key = ayahKey(t);
            if (seen.has(key) || st.blockEmitted.has(key))
                continue;
            seen.add(key);
            out.push([t.surah, t.ayah]);
        }
        return out;
    }
    structuralEvaluate() {
        const rules = this.structuralRules;
        const st = this.st;
        st.evalAt = st.tokens.length;
        const tokens = st.blockTok ? st.tokens.slice(st.blockTok) : st.tokens;
        const verses = this.structuralVerses();
        const expected = this.expected;
        const sameAyah = (a, b) => a.surah === b.surah && a.ayah === b.ayah;
        const blocked = (f) => this.ayahIssuesRaised.has(ayahKey(f))
            || st.issues.some((i) => STRUCTURAL_ERROR_KINDS.has(i.kind) && sameAyah(i, f))
            || st.pending.some((p) => sameAyah(p, f));
        if (this.aoRule) {
            const win = rules.ayahOrderWindow(expected, verses[0] ?? null);
            const found = ayahOrderFlags(rules.ayahOrderCandidate(tokens, win), this.aoRule);
            const last = st.aoLast;
            st.aoLast = new Set(found.map((f) => ayahKey(f)));
            for (const f of found) {
                const key = ayahKey(f);
                // Pause timing: the jump must hold over two pauses and the tracker must have reached a later ayah.
                if (st.aoSeen.has(key) || (!st.final && (!last.has(key)
                    || !verses.some(([s, a]) => s === f.surah && a > f.ayah))))
                    continue;
                st.aoSeen.add(key);
                if (blocked(f))
                    continue;
                st.skips.push({ surah: f.surah, ayah: f.ayah });
                st.pending.push(f);
            }
        }
        if (this.svOn) {
            const passage = [];
            if (expected) {
                for (let a = expected.ayah; a <= (expected.ayahEnd ?? expected.ayah); a++)
                    passage.push([expected.surah, a]);
            }
            else
                passage.push(...verses);
            const durationS = st.samples / SAMPLE_RATE - st.blockT0;
            const cands = rules.similarVerseCandidates(tokens, passage, !!expected, durationS, (c) => similarVerseEligible(c));
            const skips = [...st.skips, ...st.issues.filter((i) => i.kind === "possible_skipped_ayah")];
            // Pause timing: a slot is judged once the recitation has reached a later ayah.
            const reached = (t) => st.final || (expected
                ? verses.some(([s, a]) => s === passage[t][0] && a > passage[t][1])
                : t < passage.length - 1);
            for (const c of similarVersePick(cands, SIMILAR_VERSE_RULE)) {
                const key = ayahKey(c);
                if (st.svSeen.has(key) || !reached(c.slot))
                    continue;
                if (st.issues.some((i) => !i.source && sameAyah(i, c) && Math.abs(i.word - c.word) <= 1))
                    continue;
                if (this.svNearSkip && skips.some((s) => s.surah === c.surah && Math.abs(s.ayah - c.ayah) <= 1))
                    continue;
                st.svSeen.add(key);
                st.pending.push({ kind: c.kind, surah: c.surah, ayah: c.ayah, word: c.word, atSeconds: c.at ?? 0, source: "similar_verse" });
            }
        }
        const now = st.samples / SAMPLE_RATE;
        if (!st.final && now - st.blockT0 > STRUCTURAL_BLOCK_SECONDS) {
            st.blockTok = st.tokens.length;
            st.blockT0 = now;
            for (const [s, a] of verses)
                st.blockEmitted.add(`${s}:${a}`);
        }
    }
    raiseStructural() {
        const st = this.st;
        while (st.pending.length && this.correction.mode === "correction" && this.correction.state.phase === "idle") {
            const f = st.pending.shift();
            const key = ayahKey(f);
            const ayahLevel = f.kind === "possible_skipped_ayah";
            if (ayahLevel && this.ayahIssuesRaised.has(key))
                continue;
            const issue = {
                surah: f.surah, ayah: f.ayah, word: f.word,
                wordIndex: this.corpus.ayahFirstWord(f.surah, f.ayah) + f.word,
                kind: f.kind,
                ...(ayahLevel ? { words: this.wordCount(f.surah, f.ayah) } : {}),
                source: f.source,
            };
            const cursor = this.lastCursor ?? { surah: f.surah, ayah: f.ayah, word: f.word };
            if (!this.correction.raise(issue, cursor))
                continue;
            if (ayahLevel)
                this.ayahIssuesRaised.add(key);
            this.dumpTallies();
            return [this.correctionMessage()];
        }
        return [];
    }
    handle(ev) {
        const out = [];
        switch (ev.type) {
            case "cursor": {
                if (ev.surah != null && ev.ayah != null && ev.word != null) {
                    this.lastCursor = { surah: ev.surah, ayah: ev.ayah, word: ev.word };
                    out.push(this.wordProgress());
                }
                break;
            }
            case "verdicts": {
                if (this.lastCursor)
                    out.push(this.wordProgress());
                break;
            }
            case "lost": {
                // Transient: the tracker keeps its place. Losing and recovering inside
                // one surah is exactly the unclear-ayah case, so the match chain stays.
                this.correction.clearEvidence();
                break;
            }
            case "relocated": {
                this.correction.clearEvidence();
                this.lastMatch = null;
                break;
            }
            case "located": {
                this.correction.clearEvidence();
                this.lastMatch = null;
                if (ev.surah != null && ev.ayah != null) {
                    out.push({
                        type: "verse_candidate",
                        candidates: [{
                                surah: ev.surah,
                                ayah: ev.ayah,
                                confidence: 0.5,
                                rank: 0,
                                source: "discovery",
                            }],
                        stable: false,
                        final_flush: false,
                    });
                }
                break;
            }
            case "idle":
            case "completed": {
                if (ev.type === "completed" || ev.reason === "silent")
                    out.push(...this.settleCorrection());
                this.correction.clearEvidence();
                this.lastMatch = null;
                this.dumpTallies();
                out.push(...this.emitNewMatches(this.accumulated));
                this.engine.startSearch();
                this.resetDecoder();
                this.lastCursor = null;
                break;
            }
            default:
                break;
        }
        if (this.debugEnabled && ev.type !== "cursor" && ev.type !== "verdicts") {
            out.push({
                type: "debug",
                event: ev.type,
                at: Date.now(),
                data: ev,
            });
        }
        return out;
    }
    /** Correction mode: last word-level check before the main tracker is dropped. */
    settleCorrection() {
        if (this.practiceEngine)
            return [];
        const tracker = this.engine.tracer && this.engine.tracker;
        let verdicts;
        let cursor = this.lastCursor;
        let tracer = this.engine.tracer;
        if (!tracker) {
            tracer = this.engine.alignBuffer();
            if (!tracer)
                return [];
            verdicts = tracer.verdicts(true);
            const w = tracer.cursorWordIndex;
            cursor = { surah: this.corpus.wordSurah[w], ayah: this.corpus.wordAyah[w], word: this.corpus.wordInAyah[w] };
        }
        else {
            if (tracker.lost || !cursor)
                return [];
            verdicts = tracer.verdicts(true);
        }
        const raised = this.correction.settle(verdicts, cursor);
        const notes = this.noteMessages();
        if (!raised)
            return [...notes, ...this.checkSkippedAyah(true, tracer.tracker)];
        this.dumpTallies();
        return [...notes, this.correctionMessage()];
    }
    /**
     * Correction mode with an expected passage: raise `possible_skipped_ayah`
     * when the engine reads the audio on the current ayah as the next one. Live
     * checks must hold for 12 frames; `atSettle` raises at once.
     */
    checkSkippedAyah(atSettle, tracker) {
        if (this.correction.mode !== "correction" || !this.expected || !this.lastCursor && !atSettle)
            return [];
        const hit = this.engine.skippedAyah(tracker ?? this.engine.tracker);
        const key = hit ? ayahKey(hit) : null;
        const frame = this.decoder.framesDecoded;
        if (!hit || !key || this.ayahIssuesRaised.has(key)) {
            this.skipCandidate = null;
            return [];
        }
        if (!atSettle) {
            if (!this.skipCandidate || this.skipCandidate.key !== key || frame < this.skipCandidate.frame) {
                this.skipCandidate = { key, frame };
                return [];
            }
            if (frame - this.skipCandidate.frame < SKIP_PERSIST_FRAMES)
                return [];
        }
        this.skipCandidate = null;
        const words = this.wordCount(hit.surah, hit.ayah);
        const issue = {
            surah: hit.surah, ayah: hit.ayah, word: 0,
            wordIndex: this.corpus.ayahFirstWord(hit.surah, hit.ayah),
            kind: "possible_skipped_ayah",
            words,
        };
        const cursor = this.lastCursor ?? { surah: hit.surah, ayah: hit.ayah, word: 0 };
        if (!this.correction.raise(issue, cursor))
            return [];
        this.ayahIssuesRaised.add(key);
        this.dumpTallies();
        return [this.correctionMessage()];
    }
    noteMessages() {
        return this.correction.takeNotes().map(issue => ({ type: 'correction_note', issue }));
    }
    wordProgress() {
        const cursor = this.lastCursor;
        const tracer = this.engine.tracer;
        const verdicts = (tracer ? tracer.verdicts(true) : []);
        return wordProgressFromCursor(cursor, verdicts, this.wordCount(cursor.surah, cursor.ayah));
    }
    emitNewMatches(source) {
        const tallies = source ?? mergeTallies(this.accumulated, this.currentSnapshot());
        const out = [];
        const batch = newlyEligibleAyahs(tallies, this.emitted, this.minWordFraction);
        for (const t of batch) {
            this.emitted.add(ayahKey(t));
            out.push(this.toVerseMatch(t));
        }
        for (const t of batch)
            out.push(...this.checkAyahGap(t));
        return out;
    }
    /**
     * Correction mode only. `t` (ayah N+2) was just matched; if the previous
     * match of this tracker lock was ayah N of the same surah and N+1 was never
     * matched, raise one ayah-level issue for N+1. `possible_skipped_ayah` when
     * nothing of N+1 was heard, `unclear_ayah` when it was heard but not followed.
     * Word-level rules are untouched; this only covers the whole-ayah hole they
     * cannot see (no clear neighbours inside the ayah).
     */
    checkAyahGap(t) {
        const prev = this.lastMatch;
        this.lastMatch = { surah: t.surah, ayah: t.ayah };
        if ((this.stopping && !this.expected) || this.correction.mode !== "correction" || !prev || !this.lastCursor)
            return [];
        if (prev.surah !== t.surah || t.ayah !== prev.ayah + 2)
            return [];
        const surah = t.surah;
        const ayah = t.ayah - 1;
        const key = ayahKey({ surah, ayah });
        if (this.emitted.has(key) || this.ayahIssuesRaised.has(key))
            return [];
        const words = this.wordCount(surah, ayah);
        // How much of the ayah's expected audio the aligner actually heard. A real
        // skip leaves most words `skipped` (heardRatio 0) and lends only a little
        // of the next ayah's onset to the first words; a heard-but-unfollowed ayah
        // has `wrong` words with heardRatio near 1.
        const gapVerdicts = (this.engine.tracer?.verdicts(true) ?? []).filter((v) => v.surah === surah && v.ayah === ayah);
        const heardFraction = gapVerdicts.reduce((sum, v) => sum + Math.min(1, Math.max(0, v.heardRatio || 0)), 0) / Math.max(1, words);
        const kind = heardFraction >= AYAH_HEARD_FRACTION ? "unclear_ayah" : "possible_skipped_ayah";
        const issue = {
            surah, ayah, word: 0,
            wordIndex: this.corpus.ayahFirstWord(surah, ayah),
            kind,
            words,
        };
        if (!this.correction.raise(issue, this.lastCursor))
            return [];
        this.ayahIssuesRaised.add(key);
        this.dumpTallies();
        return [this.correctionMessage()];
    }
    toVerseMatch(t) {
        const verse = this.quranDb.getVerse(t.surah, t.ayah);
        return {
            type: "verse_match",
            surah: t.surah,
            ayah: t.ayah,
            verse_text: verse?.text_uthmani ?? "",
            surah_name: verse?.surah_name ?? "",
            confidence: Math.round(ayahConfidence(t) * 100) / 100,
            surrounding_verses: surroundingVerses(this.quranDb, t.surah, t.ayah),
        };
    }
    fallbackSearch(text) {
        if (!text)
            return null;
        const stripped = stripPreambles(text, this.table);
        const rest = text.slice(stripped.offset);
        if (stripped.basmala && rest.length < this.cfg.searchMinChars) {
            return { surah: 1, ayah: 1, distance: 0, how: "basmala" };
        }
        const q = this.table.encode(rest.length >= 3 ? rest : text);
        let best = null;
        for (const a of this.ayahIds) {
            if (a.ids.length > 2.5 * q.length + 8 || q.length > 2.5 * a.ids.length + 8)
                continue;
            const d = normalizedDistance(q, a.ids, this.table);
            if (!best || d < best.distance)
                best = { surah: a.surah, ayah: a.ayah, distance: d, how: "whole-ayah" };
        }
        if (!best || best.distance > this.fallbackMaxDistance)
            return null;
        return best;
    }
}
/**
 * Create the default (Zipformer) recognition session.
 *
 * ```ts
 * import * as ort from "onnxruntime-node";
 * const session = await createZipformerSession({
 *   ort,
 *   model: () => readFile("zipformer_a0w_ep1_a05.int8.onnx"),
 *   corpus: async () => JSON.parse(await readFile("zipformer_quran.json", "utf8")),
 *   quran: async () => JSON.parse(await readFile("quran.json", "utf8")),
 *   onEvent: (msg) => console.log(msg.type),
 * });
 * // executionProviders default to ["wasm"] under onnxruntime-web, ["cpu"] under node
 * await session.feed(pcm16k);
 * const final = await session.stop();
 * ```
 */
export function createZipformerSession(opts) {
    return ZipformerSession.create(opts);
}
