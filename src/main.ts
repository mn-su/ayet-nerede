import "./style.css";
import type { IdentifyCandidate, IdentifyResult } from "@tilawa/core";
import { Mushaf, arabicNumber, type MushafData } from "./mushaf";
import { DEFAULT_STOP_POLICY, StopPolicy, type StopReason } from "./stop-policy";
import type { FromWorker } from "./protocol";
import { cacheLoadedResources } from "./offline";

const BASE = import.meta.env.BASE_URL;
const MODEL_URL = `${BASE}models/zipformer_a0w_ep1_a05.int8.onnx`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const listenBtn = $<HTMLButtonElement>("listen-btn");
const listenLabel = $("listen-label");
const statusEl = $("status");
const meterBar = $("meter-bar");
const listenSection = document.querySelector<HTMLElement>(".listen")!;
const shareBtn = $<HTMLButtonElement>("share-btn");
const resultEl = $("result");
const bestBtn = $<HTMLButtonElement>("best");
const bestMeal = $("best-meal");
const noteEl = $("note");
const altsWrap = $("alts-wrap");
const altsEl = $("alts");
const moreBtn = $<HTMLButtonElement>("more-btn");
const pageEl = $("page");
const pageTitle = $("page-title");
const pageSub = $("page-sub");
const pageText = $("page-text");
const pageMeal = $("page-meal");
const pageMealWrap = $("page-meal-wrap");
const mealToggle = $<HTMLInputElement>("meal-toggle");

type Phase = "idle" | "loading" | "listening" | "finishing" | "done";

/** The selection the page was last scrolled to (see render). */
let scrolledFor = "";

const app = {
  phase: "idle" as Phase,
  modelReady: false,
  mushaf: null as Mushaf | null,
  meal: null as string[][] | null,
  result: null as IdentifyResult | null,
  final: false,
  /** Index into result.candidates of the ayah being shown. */
  selected: 0,
  /** Set when the reader pages away from the selected ayah. */
  page: null as number | null,
  seconds: 0,
  /** Audio captured in this listening session, counted on the page (the
   * status shows it even before the recognizer has heard anything). */
  micSeconds: 0,
  /** Model download progress, 0..1; null when it came from the cache. */
  download: null as number | null,
  stopReason: null as StopReason | null,
  /** Extra candidates revealed with "N ayet daha". */
  extra: 0,
};

/** Five ayahs at first (all of a word-for-word tie, up to ten). More only
 * when they are nearly as close as the best: at least %60 and at most 10
 * points below it. On 207 recorded takes this shows the button 5× less often
 * than a plain %60 bar, and finds the same right ayahs. */
const FIRST_SHOWN = 5;
const MORE_STEP = 5;
const MORE_MIN = 0.6;
const MORE_WITHIN = 0.1;

function shownCount(r: IdentifyResult): { shown: number; more: number } {
  const c = r.candidates;
  const bar = Math.max(MORE_MIN, (c[0]?.confidence ?? 0) - MORE_WITHIN);
  let limit = Math.min(FIRST_SHOWN, c.length);
  while (limit < c.length && c[limit]!.confidence >= bar - 1e-9) limit++;
  const first = Math.max(FIRST_SHOWN, Math.min(r.tied, 10));
  const shown = Math.min(c.length, Math.max(first, Math.min(FIRST_SHOWN + app.extra, limit)));
  return { shown, more: app.final ? Math.max(0, limit - shown) : 0 };
}

const prefs = {
  get meal() { try { return localStorage.getItem("db-meal") === "1"; } catch { return false; } },
  set meal(v: boolean) { try { localStorage.setItem("db-meal", v ? "1" : "0"); } catch { /* optional */ } },
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const mushafReady = fetch(`${BASE}data/mushaf.json`)
  .then((r) => r.json() as Promise<MushafData>)
  .then((d) => { app.mushaf = new Mushaf(d); });

let mealLoading: Promise<void> | null = null;
function loadMeal(): Promise<void> {
  mealLoading ??= fetch(`${BASE}data/meal-diyanet.json`)
    .then((r) => r.json() as Promise<{ meal: string[][] }>)
    .then((d) => { app.meal = d.meal; render(); });
  return mealLoading;
}

// ---------------------------------------------------------------------------
// Recognizer worker
// ---------------------------------------------------------------------------
const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
let initStarted = false;
let modelResolve: () => void;
let modelReject: (e: Error) => void;
const modelReady = new Promise<void>((res, rej) => { modelResolve = res; modelReject = rej; });
modelReady.catch(() => {});

function initModel(): void {
  if (initStarted) return;
  initStarted = true;
  worker.postMessage({ type: "init", base: new URL(BASE, location.href).href });
}

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const msg = e.data;
  if (msg.type === "progress") {
    app.download = Math.min(1, msg.fraction);
    renderStatus();
  } else if (msg.type === "ready") {
    app.modelReady = true;
    modelResolve();
    renderStatus();
  } else if (msg.type === "live" || msg.type === "final") {
    onResult(msg.result, msg.seconds, msg.type === "final");
  } else if (msg.type === "error") {
    console.error(msg.message);
    if (!app.modelReady) modelReject(new Error(msg.message));
    stopMic();
    app.phase = "idle";
    setStatus(app.modelReady ? "Bir hata oluştu. Tekrar deneyin." : "Model yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.");
    initStarted = app.modelReady;
    updateButton();
  }
};

// If the model is already in the offline cache, load it right away.
void (async () => {
  try {
    if ("caches" in self && (await caches.match(MODEL_URL))) initModel();
  } catch { /* no cache API */ }
})();

// ---------------------------------------------------------------------------
// Microphone
// ---------------------------------------------------------------------------
const mic = {
  ctx: null as AudioContext | null,
  stream: null as MediaStream | null,
  node: null as AudioWorkletNode | null,
  analyser: null as AnalyserNode | null,
  raf: 0,
  wakeLock: null as WakeLockSentinel | null,
};
const policy = new StopPolicy();

async function startMic(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
  });
  let ctx: AudioContext;
  try { ctx = new AudioContext({ sampleRate: 16000 }); } catch { ctx = new AudioContext(); }
  await ctx.audioWorklet.addModule(`${BASE}audio-processor.js`);
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "audio-stream-processor");
  node.port.postMessage({ type: "set_config", audioChunkMs: 300 });
  node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
    if (app.phase !== "listening") return;
    const samples = new Float32Array(e.data);
    app.micSeconds += samples.length / 16000;
    worker.postMessage({ type: "audio", samples }, [samples.buffer]);
  };
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  source.connect(node);
  Object.assign(mic, { ctx, stream, node, analyser });
  clearInterval(statusTimer);
  statusTimer = window.setInterval(() => {
    if (app.phase !== "listening") return;
    // Hard cap on the page's own clock, even if the recognizer falls behind.
    if (app.micSeconds >= DEFAULT_STOP_POLICY.maxSeconds) finishListening("time");
    else renderStatus();
  }, 250);
  // Keep the screen on while listening (where supported).
  try { mic.wakeLock = await (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WakeLockSentinel> } }).wakeLock?.request("screen") ?? null; } catch { /* optional */ }
  const buf = new Float32Array(analyser.fftSize);
  const tick = () => {
    if (!mic.analyser) return;
    mic.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const level = Math.min(1, Math.sqrt(sum / buf.length) * 12);
    meterBar.style.transform = `scaleX(${level.toFixed(3)})`;
    mic.raf = requestAnimationFrame(tick);
  };
  tick();
}

let statusTimer = 0;

function stopMic(): void {
  clearInterval(statusTimer);
  cancelAnimationFrame(mic.raf);
  void mic.wakeLock?.release().catch(() => {});
  mic.wakeLock = null;
  mic.stream?.getTracks().forEach((t) => t.stop());
  void mic.ctx?.close();
  Object.assign(mic, { ctx: null, stream: null, node: null, analyser: null });
  meterBar.style.transform = "scaleX(0)";
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------
function resetResult(): void {
  scrolledFor = "";
  lastLiveKey = null;
  app.result = null;
  app.final = false;
  app.selected = 0;
  app.page = null;
  app.seconds = 0;
  app.micSeconds = 0;
  app.stopReason = null;
  app.extra = 0;
  policy.reset();
  render();
}

async function startListening(): Promise<void> {
  resetResult();
  app.phase = app.modelReady ? "listening" : "loading";
  updateButton();
  initModel();
  try {
    // Start the microphone at once: audio waits in the worker queue while the
    // model loads, so nothing said in the meantime is lost.
    worker.postMessage({ type: "start" });
    app.phase = "listening";
    await startMic();
    renderStatus();
  } catch (err) {
    console.error(err);
    stopMic();
    app.phase = "idle";
    setStatus(
      location.protocol !== "https:" && location.hostname !== "localhost"
        ? "Mikrofon için sayfanın https ile açılması gerekir."
        : "Mikrofona erişilemedi. Tarayıcı izinlerini kontrol edin.",
    );
  }
  updateButton();
}

function finishListening(reason: StopReason | "user"): void {
  if (app.phase !== "listening") return;
  app.stopReason = reason === "user" ? null : reason;
  app.phase = "finishing";
  stopMic();
  worker.postMessage({ type: "stop" });
  updateButton();
}

/** Best ayah of the previous live update (shown or not). */
let lastLiveKey: string | null = null;

function onResult(result: IdentifyResult, seconds: number, final: boolean): void {
  if (app.phase !== "listening" && app.phase !== "finishing") return;
  app.seconds = seconds;
  const best = result.candidates[0];
  const key = best ? `${best.surah}:${best.ayah}` : null;
  if (!final && app.phase === "listening") {
    const reason = policy.update(result, seconds);
    if (reason) finishListening(reason);
  }
  // While listening, show a guess only once it has held first place for two
  // updates in a row: on 207 recorded takes this cut the wrong ayahs flashed
  // before the right one from 39 takes to 10, for ~0.3 s.
  const steady = final || (key !== null && key === lastLiveKey);
  lastLiveKey = key;
  if (!steady) { renderStatus(); return; }

  const prevBest = app.result?.candidates[0];
  app.result = result;
  app.final = final;
  // Follow the best candidate while listening, unless the reader picked another.
  if (!prevBest || !best || prevBest.surah !== best.surah || prevBest.ayah !== best.ayah) {
    if (!final || app.selected >= result.candidates.length) { app.selected = 0; app.page = null; }
  }
  if (final) {
    app.phase = "done";
    updateButton();
    // A short buzz when the ayah is found (Android; ignored elsewhere).
    if (result.decisive) navigator.vibrate?.(35);
  }
  render();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function setStatus(text: string): void {
  statusEl.textContent = text;
}

function updateButton(): void {
  const on = app.phase === "listening";
  listenBtn.setAttribute("aria-pressed", String(on));
  listenBtn.classList.toggle("on", on);
  listenBtn.disabled = app.phase === "finishing" || (app.phase === "loading" && !on);
  listenLabel.textContent = on ? "Durdur" : "Dinle";
}

function refText(c: IdentifyCandidate): string {
  return c.ayahEnd !== c.ayah ? `${c.surah}:${c.ayah}–${c.ayahEnd}` : `${c.surah}:${c.ayah}`;
}

function candidateLabel(c: IdentifyCandidate): string {
  const name = app.mushaf?.surahName(c.surah) ?? c.surah_name_en;
  return `${name} ${c.ayah}`;
}

const fmtSecs = (s: number) => s.toFixed(1).replace(".", ",");

function renderStatus(): void {
  const r = app.result;
  const secs = fmtSecs(app.seconds);
  if (app.phase === "listening" || app.phase === "loading") {
    if (!app.modelReady) {
      // Audio is kept while the model loads; say what we are waiting for.
      const d = app.download;
      setStatus(d !== null && d < 1
        ? `Model indiriliyor… %${Math.round(d * 100)} (yalnızca ilk sefer)`
        : "Model hazırlanıyor…");
      return;
    }
    const live = fmtSecs(app.micSeconds);
    setStatus(!r?.candidates.length ? `Dinleniyor… ${live} sn`
      : r.decisive ? `Bulundu, doğrulanıyor… ${live} sn` : `Dinleniyor… ${live} sn · tahminler güncelleniyor`);
  } else if (app.phase === "finishing") {
    setStatus("Sonuç hazırlanıyor…");
  } else if (app.phase === "done") {
    if (!r?.candidates.length) setStatus("Ayet bulunamadı. Daha net ve birkaç saniye daha uzun bir kayıtla deneyin.");
    else if (r.decisive) setStatus(`${secs} sn dinlendi · ayet bulundu.`);
    else if (r.tied > 1) setStatus(`${secs} sn dinlendi · birden çok ayette geçiyor.`);
    else setStatus(`${secs} sn dinlendi · kesin değil, en yakın adaylar listelendi.`);
  }
}

function renderResult(): void {
  const r = app.result;
  const cands = r?.candidates ?? [];
  resultEl.hidden = cands.length === 0;
  // Shrink the listen area only after listening: a button that changes size
  // under the finger mid-listening reads as a glitch.
  listenSection.classList.toggle("compact", cands.length > 0 && app.phase === "done");
  shareBtn.hidden = !app.final || cands.length === 0;
  if (!cands.length || !r) return;
  const best = cands[0]!;
  const { shown, more } = shownCount(r);
  if (app.selected >= shown) app.selected = 0;

  const badge = app.final
    ? r.decisive ? `<span class="badge ok">Kesin</span>` : `<span class="badge">Olası</span>`
    : `<span class="badge live">Canlı</span>`;
  bestBtn.innerHTML = `<span class="cand-name">${escapeHtml(candidateLabel(best))}</span>`
    + `<span class="cand-ref">${refText(best)}</span>`
    + `<span class="cand-conf">%${Math.round(best.confidence * 100)}</span>${badge}`;
  bestBtn.classList.toggle("selected", app.selected === 0);
  bestBtn.setAttribute("aria-pressed", String(app.selected === 0));

  noteEl.hidden = !(r.tied > 1);
  if (r.tied > 1) noteEl.textContent = `Duyulan ifade ${r.tied} ayette kelimesi kelimesine geçiyor; ses tek başına hangisi olduğunu ayırt edemez.`;

  moreBtn.hidden = more === 0;
  moreBtn.textContent = `${Math.min(MORE_STEP, more)} ayet daha göster`;
  const alts = cands.slice(1, shown);
  altsWrap.hidden = alts.length === 0;
  altsEl.replaceChildren(...alts.map((c, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cand" + (app.selected === i + 1 ? " selected" : "");
    b.setAttribute("aria-pressed", String(app.selected === i + 1));
    b.innerHTML = `<span class="cand-name">${escapeHtml(candidateLabel(c))}</span><span class="cand-ref">${refText(c)}</span><span class="cand-conf">%${Math.round(c.confidence * 100)}</span>`;
    b.addEventListener("click", () => select(i + 1));
    li.append(b);
    return li;
  }));

  // The meal sits right under the ayah it belongs to: the top card, or the
  // alternative the reader picked.
  const sel = cands[app.selected] ?? best;
  const showMeal = mealToggle.checked && !!app.meal;
  bestMeal.hidden = !showMeal;
  if (showMeal) {
    bestMeal.innerHTML = `<span class="meal-ref">${escapeHtml(candidateLabel(sel))}</span> ${escapeHtml(app.meal![sel.surah - 1]![sel.ayah - 1]!)}`;
  }
  const anchor = app.selected === 0 ? bestBtn : altsEl.children[app.selected - 1]?.querySelector("button");
  (anchor ?? bestBtn).after(bestMeal);
  // "Paylaş" follows too: under the open meal, or under the picked ayah.
  (showMeal ? bestMeal : anchor ?? bestBtn).after(shareBtn);
}

function renderPage(): void {
  const m = app.mushaf;
  const r = app.result;
  const sel = r?.candidates[app.selected];
  pageEl.hidden = !m || !sel;
  if (!m || !sel) return;
  const pageNo = app.page ?? m.pageFor(sel.surah, sel.ayah);
  if (pageNo === undefined) return;
  const page = m.page(pageNo)!;
  const surahsOnPage = [...new Set(page.ayahs.map((a) => a.surah))].map((s) => m.surahName(s)).join(", ");
  pageTitle.textContent = `Sayfa ${page.page}`;
  pageSub.textContent = `Cüz ${page.juz} · ${surahsOnPage}`;
  $<HTMLButtonElement>("page-prev").disabled = page.page <= m.firstPage;
  $<HTMLButtonElement>("page-next").disabled = page.page >= m.lastPage;

  const heard = new Set<string>();
  for (let a = sel.ayah; a <= sel.ayahEnd; a++) heard.add(`${sel.surah}:${a}`);
  const others = new Set((r ? r.candidates.slice(0, shownCount(r).shown) : []).filter((c) => c !== sel).map((c) => `${c.surah}:${c.ayah}`));

  const frag = document.createDocumentFragment();
  for (const a of page.ayahs) {
    if (a.ayah === 1) {
      const head = document.createElement("div");
      head.className = "surah-head";
      head.textContent = `${m.surahNameAr(a.surah)} · ${m.surahName(a.surah)} Suresi`;
      frag.append(head);
      if (a.surah !== 1 && a.surah !== 9) {
        const bsm = document.createElement("div");
        bsm.className = "basmala";
        bsm.textContent = m.basmala;
        frag.append(bsm);
      }
    }
    const span = document.createElement("span");
    const key = `${a.surah}:${a.ayah}`;
    span.className = "ayah" + (heard.has(key) ? " found" : others.has(key) ? " alt" : "");
    span.dataset.key = key;
    span.append(a.text + " ");
    const end = document.createElement("span");
    end.className = "ayah-end";
    end.textContent = arabicNumber(a.ayah);
    span.append(end, " ");
    frag.append(span);
  }
  pageText.replaceChildren(frag);

  const showMeal = mealToggle.checked && !!app.meal;
  pageMealWrap.hidden = !showMeal;
  if (showMeal) {
    pageMeal.replaceChildren(...page.ayahs.map((a) => {
      const li = document.createElement("li");
      const key = `${a.surah}:${a.ayah}`;
      li.className = heard.has(key) ? "found" : "";
      li.innerHTML = `<span class="meal-ref">${escapeHtml(m.surahName(a.surah))} ${a.ayah}</span> ${escapeHtml(app.meal![a.surah - 1]![a.ayah - 1]!)}`;
      return li;
    }));
  }
}

function render(): void {
  renderStatus();
  renderResult();
  renderPage();
  // Once listening has ended, bring the found ayah into view (once per
  // selection). Never while listening: the page would jump under the button.
  const sel = app.result?.candidates[app.selected];
  const key = sel ? `${sel.surah}:${sel.ayah}` : "";
  if (app.phase === "done" && key && key !== scrolledFor && app.page === null) {
    scrolledFor = key;
    requestAnimationFrame(() =>
      pageText.querySelector(".ayah.found")?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }
}

function select(index: number): void {
  app.selected = index;
  app.page = null;
  render();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function share(): Promise<void> {
  const c = app.result?.candidates[app.selected];
  const m = app.mushaf;
  if (!c || !m) return;
  const page = m.pageFor(c.surah, c.ayah);
  // The meal first, then where it is from.
  const lines: string[] = [];
  if (app.meal) lines.push(`“${app.meal[c.surah - 1]![c.ayah - 1]!}”`);
  lines.push(`${m.surahName(c.surah)} Suresi, ${c.ayah}. ayet (${c.surah}:${c.ayah})${page !== undefined ? ` · Sayfa ${page}` : ""}`);
  const url = location.href.split("#")[0]!;
  const text = lines.join("\n");
  try {
    if (navigator.share) await navigator.share({ title: "Ayet Nerede?", text, url });
    else { await navigator.clipboard.writeText(`${text}\n${url}`); setStatus("Panoya kopyalandı."); }
  } catch { /* cancelled */ }
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
listenBtn.addEventListener("click", () => {
  if (app.phase === "listening") finishListening("user");
  else void startListening();
});
shareBtn.addEventListener("click", () => void share());
moreBtn.addEventListener("click", () => {
  const r = app.result;
  if (!r) return;
  app.extra = shownCount(r).shown - FIRST_SHOWN + MORE_STEP;
  render();
});
// Leaving the app (switching tabs, locking the phone) ends listening and frees the microphone.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && app.phase === "listening") finishListening("user");
});
bestBtn.addEventListener("click", () => select(0));
mealToggle.checked = prefs.meal;
mealToggle.addEventListener("change", () => {
  prefs.meal = mealToggle.checked;
  if (mealToggle.checked && !app.meal) void loadMeal();
  render();
});
if (prefs.meal) void loadMeal();
const turn = (delta: number) => {
  const m = app.mushaf;
  const sel = app.result?.candidates[app.selected];
  if (!m || !sel) return;
  const cur = app.page ?? m.pageFor(sel.surah, sel.ayah)!;
  app.page = Math.min(m.lastPage, Math.max(m.firstPage, cur + delta));
  render();
};
$("page-next").addEventListener("click", () => turn(1));
$("page-prev").addEventListener("click", () => turn(-1));

void mushafReady.then(render);
updateButton();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register(`${BASE}sw.js`).catch(() => {});
  // The page loaded before the service worker took over: store what it loaded.
  addEventListener("load", () => setTimeout(() => void cacheLoadedResources([location.href.split("#")[0]!, new URL(`${BASE}data/meal-diyanet.json`, location.href).href]), 1500));
}

// Test hook (headless checks): expose state read-only.
(window as unknown as { __ayetNerede: unknown }).__ayetNerede = app;
