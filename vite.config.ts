import { readFileSync, existsSync } from "node:fs";
import { defineConfig } from "vite";

// `npm run dev -- --host` / `npm run preview -- --host` serve HTTPS when a
// local certificate exists (.lan-cert/), so a phone on the same Wi‑Fi gets a
// secure context and may use the microphone.
const cert = existsSync(".lan-cert/cert.pem")
  ? { key: readFileSync(".lan-cert/key.pem"), cert: readFileSync(".lan-cert/cert.pem") }
  : undefined;

export default defineConfig({
  base: "./",
  worker: { format: "es" },
  optimizeDeps: { exclude: ["onnxruntime-web"] },
  server: { https: cert },
  preview: { https: cert },
  build: { target: "es2022", assetsInlineLimit: 0 },
});
