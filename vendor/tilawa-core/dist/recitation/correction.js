export const AYAH_ISSUE_KINDS = new Set(['possible_skipped_ayah', 'unclear_ayah']);
/** GOP is off by default: on real clean takes it still raises false flags
 * that the other rules do not. The other GOP fields are the gating to use with
 * it (`gopFlag: -5`): wrong words only, substitutions only, outside settle. */
export const DEFAULT_CORRECTION_THRESHOLDS = {
    vowelMargin: 0.05, vowelWordMargin: 0.8, omissionMaxHeard: 1, gopFlag: -Infinity, gopAnchor: -1, settle: true,
    repetitionGain: 5, gopOnWrong: true, gopOnSkipped: false, gopOmission: false, gopSubstitution: true,
    gopNoneMargin: 2, gopNoneMin: -3, gopLocalMin: true, gopPersistFrames: 12, settleGop: false,
    repetitionMode: 'note', substitutionDistance: 0.6, slipFlag: Infinity,
};
const PERSIST_FRAMES = 12;
const withDefaults = (th) => ({ ...DEFAULT_CORRECTION_THRESHOLDS, ...th });
// Margins are differences of token probabilities, not calibrated word confidence.
// Only gross mismatches surrounded by clear aligned words are actionable. These
// are possible word errors, never pronunciation/tajweed grades.
function clearWord(v) {
    return !!v && v.state === 'ok' && Number.isFinite(v.distance) && v.distance <= 0.15
        && Number.isFinite(v.margin) && v.margin >= 0.55
        && Number.isFinite(v.heardRatio) && v.heardRatio >= 0.75 && v.heardRatio <= 1.3;
}
const hasGop = (v) => !!v && v.state !== 'pending' && typeof v.gop === 'number' && Number.isFinite(v.gop);
/** GOP rule: string alignment and acoustic fit must agree. The aligner calls
 * the word `wrong` or `skipped`, and forcing the expected word over its window
 * costs much more than the free decode. Real clean takes show GOP this low on
 * `ok` and `unsure` words too (window misallocation, elongation), so those are
 * never flagged by GOP alone. Neighbours must fit and the word must be the
 * worst fit locally, or the low score belongs to a boundary smear. */
function gopIssue(v, before, after, th) {
    if (!hasGop(v) || v.gop > th.gopFlag)
        return null;
    if (!((v.state === 'wrong' && th.gopOnWrong) || (v.state === 'skipped' && th.gopOnSkipped)))
        return null;
    const anchored = (n) => clearWord(n) || (hasGop(n) && n.gop >= th.gopAnchor && n.state !== 'skipped');
    if (!anchored(before) || !anchored(after))
        return null;
    if (th.gopLocalMin && ((hasGop(before) && before.gop < v.gop) || (hasGop(after) && after.gop < v.gop)))
        return null;
    // Silence fits the window better than the expected word does.
    const none = v.gopNone ?? -Infinity;
    const omission = v.state === 'skipped' || (none - v.gop >= th.gopNoneMargin && none >= th.gopNoneMin);
    if (omission)
        return th.gopOmission ? 'possible_omission' : null;
    return th.gopSubstitution ? 'possible_substitution' : null;
}
/** Slip head: the score says the word is off, the aligner names the kind.
 * Same-ayah neighbours are required by the caller. A clear-word anchor on top
 * of that drops the skips the head exists to catch. */
function slipIssue(v, _before, _after, th) {
    if (!(th.slipFlag < Infinity) || v.state === 'pending')
        return null;
    if (typeof v.slip !== 'number' || !Number.isFinite(v.slip) || v.slip < th.slipFlag)
        return null;
    if (v.state === 'skipped')
        return 'possible_omission';
    if (Number.isFinite(v.distance) && v.distance <= 0.15)
        return 'possible_vowel';
    return 'possible_substitution';
}
/** One word said twice. Going back over several words in a row is a phrase
 * restart (waqf then ibtida'), which is accepted practice, so a neighbour that
 * also repeats vetoes the flag. */
function repetitionIssue(v, before, after, th) {
    const repeats = (n) => typeof n.repGain === 'number' && n.repGain >= th.repetitionGain;
    return hasGop(v) && v.gop >= th.gopAnchor && repeats(v) && clearWord(before) && !repeats(before) && !repeats(after);
}
export function possibleWordIssues(verdicts, thresholds = DEFAULT_CORRECTION_THRESHOLDS) {
    return ruledWordIssues(verdicts, withDefaults(thresholds)).map(r => r.issue);
}
function ruledWordIssues(verdicts, th) {
    const byIndex = new Map(verdicts.map(v => [v.wordIndex, v]));
    return verdicts.flatMap((v) => {
        const before = byIndex.get(v.wordIndex - 1);
        const after = byIndex.get(v.wordIndex + 1);
        // Do not infer leading/trailing omissions, uncertain audio, or skipped ayahs.
        if (!before || !after || before.surah !== v.surah || after.surah !== v.surah
            || before.ayah !== v.ayah || after.ayah !== v.ayah)
            return [];
        const at = (kind, rule) => [{ issue: { surah: v.surah, ayah: v.ayah, word: v.word, wordIndex: v.wordIndex, kind }, rule }];
        const gopKind = gopIssue(v, before, after, th);
        const rep = !gopKind && th.repetitionMode !== 'off' && repetitionIssue(v, before, after, th);
        const extra = gopKind ? at(gopKind, 'gop') : rep ? at('possible_repetition', 'repetition') : [];
        const slip = !gopKind && !rep ? slipIssue(v, before, after, th) : null;
        if (!clearWord(before) || !clearWord(after))
            return slip ? at(slip, 'slip') : extra;
        // A partly heard word (the aligner lent it a few chars of its neighbours,
        // or the reciter said only its onset) is still an omission.
        const omission = v.state === 'skipped' && (v.heardRatio === 0 || v.heardRatio <= th.omissionMaxHeard);
        const substitution = v.state === 'wrong' && Number.isFinite(v.distance) && v.distance >= th.substitutionDistance
            && Number.isFinite(v.margin) && v.margin >= 0.65
            && v.heardRatio >= 0.5 && v.heardRatio <= 1.5;
        // Harakah error: consonant skeleton matches (distance within `ok`), but at
        // least one aligned short vowel differs and the decoder was sure about it.
        const vowel = (v.state === 'ok' || v.state === 'unsure') && Number.isFinite(v.distance) && v.distance <= 0.15
            && (v.vowelErrors ?? 0) >= 1 && Number.isFinite(v.vowelMargin) && v.vowelMargin >= th.vowelMargin
            && Number.isFinite(v.margin) && v.margin >= th.vowelWordMargin
            && v.heardRatio >= 0.75 && v.heardRatio <= 1.3;
        const kind = omission ? 'possible_omission' : substitution ? 'possible_substitution'
            : vowel ? 'possible_vowel' : null;
        if (kind)
            return at(kind, 'aligner');
        return slip ? at(slip, 'slip') : extra;
    });
}
/** Pure state machine. Pass full, non-forced-settled acoustic snapshots only.
 * Frames must be monotonic within an observation stream. A new retry gets a new
 * attempt ID, so old audio/results cannot accidentally produce success. */
export class CorrectionController {
    mode = 'tracking';
    thresholds = DEFAULT_CORRECTION_THRESHOLDS;
    state = { phase: 'idle', issue: null, resume: null, attempt: 0, outcome: null };
    suppressed = new Set();
    candidates = new Map();
    retryFrame = null;
    /** Words observe() has judged with their context settled (both neighbours
     * and the word after next) since the last settle(). */
    seenSettled = new Set();
    notes = [];
    reset() {
        this.state = { phase: 'idle', issue: null, resume: null, attempt: this.state.attempt + 1, outcome: null };
        this.suppressed.clear();
        this.seenSettled.clear();
        this.notes = [];
        this.clearEvidence();
    }
    clearEvidence() { this.candidates.clear(); this.retryFrame = null; }
    setMode(mode) { this.mode = mode; this.clearEvidence(); }
    observe(verdicts, cursor, frame, attempt = this.state.attempt) {
        if (this.mode !== 'correction' || !Number.isFinite(frame) || attempt !== this.state.attempt)
            return false;
        const th = withDefaults(this.thresholds);
        if (this.state.phase === 'retrying') {
            const issue = this.state.issue;
            // Require a fresh, clear prefix from the start of this ayah through the
            // flagged word; a verse match or cursor advance alone cannot succeed.
            const through = issue.word + Math.max(1, issue.words ?? 1) - 1;
            const prefix = verdicts.filter(v => v.surah === issue.surah && v.ayah === issue.ayah && v.word <= through);
            // A retry that repeats a confident vowel error, or says a word twice
            // again, is not a correction.
            const good = Array.from({ length: through + 1 }, (_, word) => prefix.find(v => v.word === word)).every(v => clearWord(v)
                && ((v.vowelErrors ?? 0) === 0 || v.vowelMargin < th.vowelMargin)
                && !((v.repGain ?? -Infinity) >= th.repetitionGain));
            if (!good) {
                this.retryFrame = null;
                return false;
            }
            if (this.retryFrame === null || frame < this.retryFrame)
                this.retryFrame = frame;
            if (frame - this.retryFrame < 12)
                return false;
            this.state = { ...this.state, phase: 'corrected', outcome: 'corrected' };
            return true;
        }
        if (this.state.phase !== 'idle')
            return false;
        const settledAt = new Set(verdicts.filter(v => v.state !== 'pending').map(v => v.wordIndex));
        for (const w of settledAt) {
            if (settledAt.has(w - 1) && settledAt.has(w + 1) && settledAt.has(w + 2))
                this.seenSettled.add(w);
        }
        const issues = ruledWordIssues(verdicts, th).filter(r => !this.suppressed.has(r.issue.wordIndex));
        const live = new Set(issues.map(r => r.issue.wordIndex));
        for (const key of this.candidates.keys())
            if (!live.has(key))
                this.candidates.delete(key);
        for (const { issue, rule } of issues) {
            const old = this.candidates.get(issue.wordIndex);
            const persist = rule === 'gop' ? th.gopPersistFrames : PERSIST_FRAMES;
            if (!old || old.kind !== issue.kind || frame < old.frame) {
                this.candidates.set(issue.wordIndex, { kind: issue.kind, frame });
            }
            else if (frame - old.frame >= persist) {
                if (this.queueNote(issue, rule, th))
                    continue;
                this.state = { phase: 'error', issue, resume: { ...cursor }, attempt: this.state.attempt, outcome: null };
                this.clearEvidence();
                return true;
            }
        }
        return false;
    }
    /** Soft notes (repetition in `note` mode) raised since the last call. They
     * never change {@link state}. */
    takeNotes() {
        const out = this.notes;
        this.notes = [];
        return out;
    }
    queueNote(issue, rule, th) {
        if (rule !== 'repetition' || th.repetitionMode !== 'note')
            return false;
        this.suppressed.add(issue.wordIndex);
        this.candidates.delete(issue.wordIndex);
        this.notes.push({ ...issue });
        return true;
    }
    /** Final word-level check on settled verdicts when the tracker is about to
     * be dropped (end of audio, surah completed, silent idle). Settled verdicts
     * no longer change, so no persistence is required. Without it, an error in
     * the last words before a stop is never judged with its right neighbour.
     * Only words observe() never judged in full context are checked, and vowel
     * flags stay observe-only. Raises the earliest issue. */
    settle(verdicts, cursor) {
        const th = withDefaults(this.thresholds);
        const seen = this.seenSettled;
        this.seenSettled = new Set();
        if (this.mode !== 'correction' || this.state.phase !== 'idle' || !th.settle)
            return false;
        const ruled = ruledWordIssues(verdicts, th)
            .filter(r => !this.suppressed.has(r.issue.wordIndex) && !seen.has(r.issue.wordIndex)
            && (r.issue.kind !== 'possible_vowel' || r.rule === 'slip')
            && (th.settleGop || r.rule !== 'gop'))
            .sort((a, b) => a.issue.wordIndex - b.issue.wordIndex);
        const first = ruled.find(r => !this.queueNote(r.issue, r.rule, th));
        if (!first)
            return false;
        const issue = first.issue;
        this.state = { phase: 'error', issue, resume: { ...cursor }, attempt: this.state.attempt, outcome: null };
        this.clearEvidence();
        return true;
    }
    /** Raise an issue the session inferred outside the word-level rules (the
     * ayah-level kinds). Same gates as a word flag: correction mode, idle, not
     * dismissed/deferred earlier in this session. */
    raise(issue, cursor) {
        if (this.mode !== 'correction' || this.state.phase !== 'idle' || this.suppressed.has(issue.wordIndex))
            return false;
        this.state = { phase: 'error', issue: { ...issue }, resume: { ...cursor }, attempt: this.state.attempt, outcome: null };
        this.clearEvidence();
        return true;
    }
    act(action) {
        const { phase, issue } = this.state;
        if (!issue || phase === 'idle')
            return false;
        if (action === 'retry' && (phase === 'error' || phase === 'corrected')) {
            this.state = { ...this.state, phase: 'retrying', attempt: this.state.attempt + 1, outcome: null };
        }
        else if (action === 'stop_retry' && phase === 'retrying') {
            this.state = { ...this.state, phase: 'error', attempt: this.state.attempt + 1 };
        }
        else if ((action === 'dismiss' && phase === 'error') || action === 'review_later'
            || action === 'close' || (action === 'continue' && phase === 'corrected')) {
            const outcome = action === 'dismiss' ? 'dismissed' : phase === 'corrected' ? 'corrected' : 'deferred';
            this.suppressed.add(issue.wordIndex);
            this.state = { ...this.state, phase: 'idle', attempt: this.state.attempt + 1, outcome };
        }
        else
            return false;
        this.clearEvidence();
        return true;
    }
}
