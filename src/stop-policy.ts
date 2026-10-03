import type { IdentifyResult } from "@tilawa/core";

export interface StopPolicyOptions {
  /** Consecutive decisive updates with the same best ayah before stopping. */
  stableUpdates: number;
  /** Never stop on a decisive answer before this much audio. */
  minSeconds: number;
  /** Stop anyway after this much audio. */
  maxSeconds: number;
  /** A passage repeated word for word (`tied` > 1) is never decisive: stop
   * once the same tied set has held this many updates. */
  tiedUpdates: number;
}

/**
 * Updates come every ~0.3 s. Two decisive updates in a row on the same ayah
 * end listening. On 207 recorded live traces (README, "Hız ayarı") no
 * decisive update ever named a wrong ayah, so this trades only ~0.3 s for a
 * margin against noisy microphones.
 */
export const DEFAULT_STOP_POLICY: StopPolicyOptions = { stableUpdates: 2, minSeconds: 1.5, maxSeconds: 15, tiedUpdates: 8 };

export type StopReason = "confident" | "tied" | "time";

/** Decides when listening can end on its own. Pure: feed it every live result. */
export class StopPolicy {
  private run = 0;
  private lastKey: string | null = null;
  private tiedRun = 0;
  private lastTied: string | null = null;

  constructor(private readonly opts: StopPolicyOptions = DEFAULT_STOP_POLICY) {}

  reset(): void {
    this.run = 0;
    this.lastKey = null;
    this.tiedRun = 0;
    this.lastTied = null;
  }

  update(result: IdentifyResult, seconds: number): StopReason | null {
    const best = result.candidates[0];
    const key = best ? `${best.surah}:${best.ayah}` : null;
    this.run = result.decisive && key !== null && key === this.lastKey ? this.run + 1 : result.decisive ? 1 : 0;
    this.lastKey = key;
    const tied = result.tied > 1
      ? result.candidates.slice(0, result.tied).map((c) => `${c.surah}:${c.ayah}`).sort().join(",")
      : null;
    this.tiedRun = tied !== null && tied === this.lastTied ? this.tiedRun + 1 : tied !== null ? 1 : 0;
    this.lastTied = tied;
    if (seconds >= this.opts.maxSeconds) return "time";
    if (seconds < this.opts.minSeconds) return null;
    if (this.run >= this.opts.stableUpdates) return "confident";
    if (this.tiedRun >= this.opts.tiedUpdates) return "tied";
    return null;
  }
}
