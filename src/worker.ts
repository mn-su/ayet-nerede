/// <reference lib="webworker" />
/**
 * Runs the recognizer off the main thread.
 *
 * main → worker: init | start | audio (mono 16 kHz chunk) | stop | file
 * worker → main: progress | ready | live (candidates so far) | final | error
 *
 * Every message is handled in order: feed/stop/reset share the streaming
 * encoder state and must never overlap.
 */
import * as ort from "onnxruntime-web/wasm";
import { createZipformerSession, type ZipformerSession } from "@tilawa/core";
import type { FromWorker, ToWorker } from "./protocol";
import { cacheLoadedResources, cachedBytes } from "./offline";

declare const self: DedicatedWorkerGlobalScope;

const TOP_K = 5;
const SAMPLE_RATE = 16000;
let session: ZipformerSession | null = null;
let heardSamples = 0;

const post = (msg: FromWorker) => self.postMessage(msg);

async function init(base: string): Promise<void> {
  const corpus = JSON.parse(new TextDecoder().decode(await cachedBytes(`${base}models/zipformer_quran.json`)));
  const MODEL_BYTES = 69_246_033;
  const model = await cachedBytes(`${base}models/zipformer_a0w_ep1_a05.int8.onnx`, (loaded, total) =>
    post({ type: "progress", fraction: loaded / (total || MODEL_BYTES) }));
  // Single-threaded WASM: no COOP/COEP headers needed, works on any static host.
  ort.env.wasm.numThreads = 1;
  session = await createZipformerSession({
    ort,
    model,
    corpus,
    executionProviders: ["wasm"],
    structural: false, // correction-mode rules: not used here
  });
  // Warm-up: the first inference pays WASM/JIT set-up; do it before the user speaks.
  await session.feed(new Float32Array(SAMPLE_RATE));
  session.reset();
  post({ type: "ready" });
  void cacheLoadedResources(); // the ONNX Runtime WASM, loaded by this worker
}

/** Live updates whenever new phonemes arrived (one per 300 ms audio chunk at
 * most): the search takes ~10–80 ms on a desktop. */
const MIN_UPDATE_MS = 250;
let lastLen = -1;
let lastAt = 0;

function live(final: boolean): void {
  if (!session) return;
  const len = session.transcript.length;
  const now = performance.now();
  if (!final && (len === lastLen || now - lastAt < MIN_UPDATE_MS)) return;
  lastLen = len;
  lastAt = now;
  const result = session.candidatesSoFar({ topK: TOP_K });
  post({ type: final ? "final" : "live", result, seconds: heardSamples / SAMPLE_RATE });
}

async function handle(msg: ToWorker): Promise<void> {
  if (msg.type === "init") return init(msg.base);
  if (!session) throw new Error("Model hazır değil");
  switch (msg.type) {
    case "start":
      session.reset();
      heardSamples = 0;
      lastLen = -1;
      return;
    case "audio":
      heardSamples += msg.samples.length;
      await session.feed(msg.samples);
      return live(false);
    case "stop":
      await session.stop();
      return live(true);
  }
}

let queue = Promise.resolve();
self.onmessage = (e: MessageEvent<ToWorker>) => {
  queue = queue.then(() => handle(e.data)).catch((err) => {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  });
};
