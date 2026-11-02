"""Speaker-embedding service backed by SpeechBrain's ECAPA-TDNN model.

Stateless: it turns a few seconds of speech into a 192-number "voiceprint".
Storing voiceprints and deciding who is speaking happens in the Node server.

    POST /embed   body: raw 16 kHz mono int16 little-endian PCM
                  -> {"embedding": [...192 floats...], "seconds": 2.4}
    GET  /health  -> {"ok": true}

Run:  python sidecar/voice_service.py   (the Vite dev server starts it for you)
"""
import os
import sys

import numpy as np
import torch
from flask import Flask, jsonify, request
from speechbrain.inference.speaker import EncoderClassifier
from speechbrain.utils.fetching import LocalStrategy

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE_RATE = 16000
MIN_SECONDS = 0.8
MAX_SECONDS = 30

torch.set_num_threads(max(1, (os.cpu_count() or 2) // 2))

print("[voice] loading speechbrain/spkrec-ecapa-voxceleb ...", flush=True)
classifier = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb",
    savedir=os.path.join(HERE, "pretrained", "ecapa"),
    run_opts={"device": "cpu"},
    local_strategy=LocalStrategy.COPY,  # symlinks need admin rights on Windows
)
print("[voice] ready", flush=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = SAMPLE_RATE * 2 * MAX_SECONDS


@app.get("/health")
def health():
    return jsonify(ok=True)


@app.post("/embed")
def embed():
    raw = request.get_data()
    if len(raw) % 2:
        raw = raw[:-1]
    pcm = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    seconds = len(pcm) / SAMPLE_RATE
    if seconds < MIN_SECONDS:
        return jsonify(error=f"Need at least {MIN_SECONDS} s of speech"), 400
    with torch.no_grad():
        emb = classifier.encode_batch(torch.from_numpy(pcm).unsqueeze(0))
    vec = emb.squeeze().cpu().numpy()
    return jsonify(embedding=[float(x) for x in vec], seconds=round(seconds, 2))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("VOICE_PORT", "8791"))
    app.run(host="127.0.0.1", port=port, threaded=False)
