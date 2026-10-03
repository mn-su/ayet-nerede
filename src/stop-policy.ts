import type { IdentifyResult } from "@tilawa/core";

export interface StopPolicyOptions {
  /** Consecutive decisive updates with the same best ayah before stopping. */
  stableUpdates: number;
  /** Never stop on a decisive answer before this much audio. */
  minSeconds: number;
  /** Stop anyway after this much audio. */
  maxSeconds: number;
  /** A passage repeated word for word (`tied` > 1) is never decisive: stop
   * once the same tied set has held for this much audio. */
  tiedSeconds: number;
  /** Stop when something was heard but nothing new for this much audio (the
   * reader stopped). Longer than a long madd or a breath. */
  silenceSeconds: number;
}

/**
 * Updates come every ~0.3 s while new phonemes arrive, and about once a
 * second otherwise (so time-based rules still run in silence). Two decisive
 * updates in a row on the same ayah end listening. On 207 recorded live
 * traces no decisive update ever named a wrong ayah, so this trades only
 * ~0.3 s for a margin against noisy microphones.
 */
export const DEFAULT_STOP_POLICY: StopPolicyOptions = {
  stableUpdates: 2, minSeconds: 1.5, maxSeconds: 15, tiedSeconds: 2.4, silenceSeconds: 3,
};

export type StopReason = "confident" | "tied" | "silence" | "time";

/** Decides when listening can end on its own. Pure: feed it every live result. */
export class StopPolicy {
  private run = 0;
  private lastKey: string | null = null;
  private lastTied: string | null = null;
  private tiedSince = 0;
  private lastLen = -1;
  private grewAt = 0;

  constructor(private readonly opts: StopPolicyOptions = DEFAULT_STOP_POLICY) {}

  reset(): void {
    this.run = 0;
    this.lastKey = null;
    this.lastTied = null;
    this.tiedSince = 0;
    this.lastLen = -1;
    this.grewAt = 0;
  }

  update(result: IdentifyResult, seconds: number): StopReason | null {
    const best = result.candidates[0];
    const key = best ? `${best.surah}:${best.ayah}` : null;
    this.run = result.decisive && key !== null && key === this.lastKey ? this.run + 1 : result.decisive ? 1 : 0;
    this.lastKey = key;
    const tied = result.tied > 1
      ? result.candidates.slice(0, result.tied).map((c) => `${c.surah}:${c.ayah}`).sort().join(",")
      : null;
    if (tied !== this.lastTied) this.tiedSince = seconds;
    this.lastTied = tied;
    if (result.transcript.length !== this.lastLen) {
      this.lastLen = result.transcript.length;
      this.grewAt = seconds;
    }
    if (seconds >= this.opts.maxSeconds) return "time";
    if (seconds < this.opts.minSeconds) return null;
    if (this.run >= this.opts.stableUpdates) return "confident";
    if (tied !== null && seconds - this.tiedSince >= this.opts.tiedSeconds) return "tied";
    if (this.lastLen > 0 && seconds - this.grewAt >= this.opts.silenceSeconds) return "silence";
    return null;
  }
}
