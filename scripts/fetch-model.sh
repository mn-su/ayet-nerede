#!/usr/bin/env bash
# Recognizer assets (not in git: large, and NPL-1.2 licensed — see README).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/models
get() { [ -s "$2" ] || { echo "↓ $2"; curl -fL --retry 3 -o "$2" "$1"; }; }
get https://github.com/yazinsai/tilawa/releases/download/zipformer-a0w-ep1-a0.5/zipformer_a0w_ep1_a05.int8.onnx public/models/zipformer_a0w_ep1_a05.int8.onnx
get https://github.com/yazinsai/tilawa/releases/download/v0.3.0/zipformer_quran.json public/models/zipformer_quran.json
echo "ok"
