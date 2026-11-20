"""Voice every mission line with Kokoro (local, on this PC's GPU) and write the clip list the game reads.

    python tools/voice_missions.py              render new/changed lines only, write theme/assets/cft-vo.js
    python tools/voice_missions.py --list       print speaker / text, render nothing
    python tools/voice_missions.py --only max   re-render one speaker (also --only max,rosa)
    python tools/voice_missions.py --force      re-render everything

Then upload and publish (APP_MAKER/media, needs `npx wrangler login` once):
    python -I ../APP_MAKER/media/r2_deploy.py   (uploads media/public/vo/cft/*.mp3 to R2 as vo/cft/<file>.mp3)
    python tools/assets.py                      (new ?v= hash for cft-vo.js), commit, push

Lines come from tools/vo_lines.mjs (same speaker + key code as the game, cft-cine.js). Each speaker has a Kokoro voice
below. Clips: MP3 mono 24 kHz 48 kbps in APP_MAKER/media/public/vo/cft/<md5 of voice + text>.mp3 (a changed line or
voice gets a new file name, so the year-long cache never serves an old take). cft-vo.js: window.CFT_VO = {dir, clips:
{key: [file, seconds, envelope] | {gf: [...], bf: [...]}}}; envelope = mouth openness, one digit 0-9 per 1/20 s.
"""
import argparse
import hashlib
import json
import subprocess
import sys
import time
import warnings
from pathlib import Path

import numpy as np
from scipy import signal

HERE = Path(__file__).resolve().parent
APP = HERE.parent
OUT = APP.parent / "APP_MAKER" / "media" / "public" / "vo" / "cft"
MANIFEST = APP / "theme" / "assets" / "cft-vo.js"
CACHE = OUT / "_takes.json"            # file -> [seconds, envelope], so unchanged lines aren't re-rendered
SR = 24000
FPS = 20
LEVEL_DB = -18.0
PROC = "v1"                            # bump to re-render everything after changing the processing

# speaker -> (Kokoro voice or blend, speed, pitch factor). Pitch > 1 = higher (rendered slower, then resampled).
VOICES = {
    "narrator": ("bm_george*0.55+am_onyx*0.45", 0.9, 1.0),
    "max": ("am_michael", 1.0, 1.0),           # laid-back musician cousin
    "rosa": ("bf_isabella*0.7+af_kore*0.3", 0.93, 1.0),   # the nonna
    "kim": ("af_nova", 1.12, 1.0),             # coach, never stops
    "okafor": ("bm_george", 0.95, 1.0),        # professor
    "priya": ("bf_alice", 1.0, 1.0),           # banker
    "dmitri": ("am_onyx", 0.97, 1.0),          # mechanic
    "luna": ("af_sky", 1.04, 1.0),             # street artist
    "kai": ("am_puck", 1.08, 1.0),             # skater
    "jay": ("am_liam", 1.04, 1.0),             # gamer
    "noor": ("af_river", 1.0, 1.0),            # photographer
    "benny": ("am_echo", 1.02, 1.0),           # food blogger
    "zoe": ("af_aoede", 1.03, 1.0),            # DJ
    "ollie": ("am_adam", 1.0, 1.0),            # shelter volunteer
    "sam": ("af_heart", 1.0, 1.0),             # flower shop (when you date a woman)
    "sam_b": ("am_eric", 1.0, 1.0),            # flower shop (when you date a man)
    "tomas": ("bm_daniel", 1.0, 1.0),          # chef
    "bouchard": ("bm_lewis", 1.0, 1.0),        # neighbourhood cop
    "chad": ("am_fenrir", 1.02, 1.0),          # the developer
    "mayor": ("bm_fable", 0.97, 1.0),
    "tourist": ("bf_emma", 1.05, 1.0),
    "grandpa": ("am_santa", 0.88, 1.0),        # retired mailman
    "busker": ("am_puck*0.5+am_onyx*0.5", 1.0, 1.0),
    "thief": ("am_fenrir", 1.1, 1.0),
    "lostkid": ("af_sky", 0.86, 1.22),
    "kid": ("af_sky", 0.86, 1.22),
}
DEFAULT = ("af_heart", 1.0, 1.0)


def lines():
    r = subprocess.run(["node", str(HERE / "vo_lines.mjs")], capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        sys.exit("vo_lines.mjs failed:\n" + r.stderr)
    return json.loads(r.stdout)


def voice_of(speaker):
    return VOICES.get(speaker, DEFAULT)


def file_of(ln):
    v = voice_of(ln["speaker"])
    return hashlib.md5(("%s|%s|%s|%s" % (PROC, v, ln["speaker"], ln["say"])).encode("utf-8")).hexdigest()[:12]


class Kokoro:
    def __init__(self):
        self.pipes, self.model, self.packs = {}, None, {}

    def pipe(self, lang):
        if lang not in self.pipes:
            warnings.filterwarnings("ignore")
            from kokoro import KPipeline
            p = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M", model=self.model if self.model is not None else True)
            self.model = p.model
            self.pipes[lang] = p
        return self.pipes[lang]

    def pack(self, spec, lang):
        if spec not in self.packs:
            import torch
            parts = []
            for term in spec.split("+"):
                name, _, w = term.strip().partition("*")
                parts.append((name.strip(), float(w) if w else 1.0))
            total = sum(w for _, w in parts)
            p = self.pipe(lang)
            v = sum(p.load_voice(n) * (w / total) for n, w in parts) if len(parts) > 1 else p.load_voice(parts[0][0])
            self.packs[spec] = v.float() if isinstance(v, torch.Tensor) else v
        return self.packs[spec]

    def say(self, text, spec, speed=1.0):
        lang = spec.strip()[0]
        p = self.pipe(lang)
        out = [r.audio.numpy() for r in p(text, voice=self.pack(spec, lang), speed=speed, split_pattern=r"\n+") if r.audio is not None]
        return np.concatenate(out).astype(np.float32) if out else np.zeros(SR // 4, np.float32)


def trim(x, thresh_db=-42.0, pad=0.03):
    frame = int(SR * 0.01)
    n = len(x) // frame
    if n < 2:
        return x
    e = np.sqrt(np.mean(x[: n * frame].reshape(n, frame) ** 2, axis=1) + 1e-12)
    on = np.where(20 * np.log10(e / e.max() + 1e-12) > thresh_db)[0]
    if not len(on):
        return x
    return x[max(0, on[0] * frame - int(pad * SR)): min(len(x), (on[-1] + 1) * frame + int(pad * SR))]


def level(x, target_db=LEVEL_DB, peak=0.95):
    y = x * (10 ** (target_db / 20) / float(np.sqrt(np.mean(x ** 2) + 1e-12)))
    th = 0.75 * peak
    a = np.abs(y)
    over = a > th
    y[over] = np.sign(y[over]) * (th + (peak - th) * np.tanh((a[over] - th) / (peak - th)))
    return y.astype(np.float32)


def envelope(x):
    hop = SR // FPS
    n = int(np.ceil(len(x) / hop))
    e = np.sqrt(np.mean(np.pad(x, (0, n * hop - len(x))).reshape(n, hop) ** 2, axis=1))
    e = np.convolve(e, [0.25, 0.5, 0.25], mode="same")
    top = np.percentile(e, 95) if len(e) else 0
    if top <= 1e-6:
        return "0" * n
    e = np.clip(e / top, 0, 1)
    e[e < 0.1] = 0
    return "".join(str(int(round(v * 9))) for v in e)


def mp3(x, path):
    import imageio_ffmpeg
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
    r = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1", "-i", "-",
                        "-codec:a", "libmp3lame", "-b:a", "48k", "-ar", str(SR), "-ac", "1", str(path)], input=pcm, capture_output=True)
    if r.returncode:
        sys.exit("ffmpeg failed: " + r.stderr.decode("utf-8", "replace"))


def render(kok, ln):
    spec, speed, pitch = voice_of(ln["speaker"])
    a = kok.say(ln["say"], spec, speed)
    if pitch != 1.0:   # rendered slow, played back faster = a higher voice at a normal pace
        a = signal.resample(a, int(len(a) / pitch)).astype(np.float32)
    a = trim(a)
    f = int(0.005 * SR), int(0.03 * SR)
    a[: f[0]] *= np.linspace(0, 1, f[0])
    a[-f[1]:] *= np.linspace(1, 0, f[1])
    a = np.concatenate([np.zeros(int(0.04 * SR), np.float32), a, np.zeros(int(0.12 * SR), np.float32)])
    return level(a)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    data = lines()
    todo = data["lines"]
    if args.list:
        for ln in todo:
            print("%-9s %-3s %s" % (ln["speaker"], ln["variant"] or "", ln["say"]))
        print("\n%d lines; words in capitals seen: %s" % (len(todo), ", ".join(data["caps"])))
        return
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        takes = json.loads(CACHE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        takes = {}
    only = set(filter(None, args.only.split(",")))
    kok, t0, made = None, time.time(), 0
    for i, ln in enumerate(todo):
        f = file_of(ln)
        ln["file"] = f
        path = OUT / (f + ".mp3")
        redo = args.force or (only and ln["speaker"] in only)
        if path.exists() and f in takes and not redo:
            continue
        if kok is None:
            print("loading Kokoro...", flush=True)
            kok = Kokoro()
        a = render(kok, ln)
        mp3(a, path)
        takes[f] = [round(len(a) / SR, 2), envelope(a)]
        made += 1
        if made % 20 == 0:
            CACHE.write_text(json.dumps(takes), encoding="utf-8")
            print("  %d/%d  %.0fs" % (i + 1, len(todo), time.time() - t0), flush=True)
    CACHE.write_text(json.dumps(takes), encoding="utf-8")
    clips = {}
    for ln in todo:
        dur, env = takes[ln["file"]]
        entry = [ln["file"], dur, env]
        if ln["variant"]:
            clips.setdefault(ln["key"], {})[ln["variant"]] = entry
        else:
            clips[ln["key"]] = entry
    body = ("/* City Fun Time: the voiced mission lines (made by tools/voice_missions.py with Kokoro; do not edit by hand).\n"
            "   key (CFTCine.key) -> [file, seconds, mouth envelope 0-9 per 1/20 s] or {gf, bf}. Files: <media base>vo/cft/<file>.mp3 */\n"
            "window.CFT_VO = " + json.dumps({"dir": "vo/cft/", "n": len(todo), "clips": clips}, separators=(",", ":"), ensure_ascii=False) + ";\n")
    MANIFEST.write_bytes(body.encode("utf-8"))
    used = {ln["file"] for ln in todo}
    for p in OUT.glob("*.mp3"):   # old takes of changed lines (already on R2 they do no harm; they just don't go up again)
        if p.stem not in used:
            p.unlink()
            takes.pop(p.stem, None)
    CACHE.write_text(json.dumps(takes), encoding="utf-8")
    total = sum(takes[ln["file"]][0] for ln in todo)
    size = sum((OUT / (ln["file"] + ".mp3")).stat().st_size for ln in todo) / 1e6
    print("%d new clips; %d lines, %.1f minutes, %.1f MB of MP3 in %s; wrote %s (%d KB)"
          % (made, len(todo), total / 60, size, OUT, MANIFEST.name, MANIFEST.stat().st_size // 1024))


if __name__ == "__main__":
    main()
