/** One cache for everything the app needs offline (see public/sw.js). */
export const CACHE = "ayet-nerede-v1";

/** Bytes of `url`, from the cache when present; otherwise fetched (with
 * progress) and stored. Works whether or not a service worker controls us. */
export async function cachedBytes(url: string, onProgress?: (loaded: number, total: number) => void): Promise<Uint8Array> {
  const cache = await caches.open(CACHE).catch(() => null);
  const hit = await cache?.match(url);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const p of parts) { bytes.set(p, at); at += p.length; }
  await cache?.put(url, new Response(bytes, { headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" } })).catch(() => {});
  return bytes;
}

/** Store the same-origin files this context has loaded so far (page shell,
 * data, fonts, WASM): the first visit is then enough to work offline. */
export async function cacheLoadedResources(extra: string[] = []): Promise<void> {
  if (!("caches" in self)) return;
  const cache = await caches.open(CACHE);
  const urls = new Set(extra);
  for (const e of performance.getEntriesByType("resource")) {
    const u = new URL(e.name);
    if (u.origin === self.location.origin && !u.pathname.includes("/models/")) urls.add(u.href);
  }
  await Promise.all([...urls].map(async (u) => {
    if (!(await cache.match(u))) await cache.add(u).catch(() => {});
  }));
}
