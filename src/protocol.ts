import type { IdentifyResult } from "@tilawa/core";

export type ToWorker =
  | { type: "init"; base: string }
  | { type: "start" }
  | { type: "audio"; samples: Float32Array }
  | { type: "stop" };

export type FromWorker =
  | { type: "progress"; fraction: number }
  | { type: "ready" }
  | { type: "live" | "final"; result: IdentifyResult; seconds: number }
  | { type: "error"; message: string };
