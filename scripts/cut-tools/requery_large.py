"""Переспрос фрагмента серии whisper-large-v3 (Groq): печать сегментов в абсолютном времени.
usage: python scripts/cut-tools/requery_large.py <video> <from_s> <to_s> [out.json]"""
import sys, subprocess, json, os, tempfile, urllib.request, uuid
video, a, b = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
key = None
ENV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env")
for line in open(ENV, encoding="utf-8"):
    if line.startswith("GROQ_API_KEY="): key = line.split("=", 1)[1].strip().strip('"')
tmp = os.path.join(tempfile.gettempdir(), f"frag_{uuid.uuid4().hex}.ogg")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(a), "-to", str(b), "-i", video, "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "32k", tmp], check=True)
data = open(tmp, "rb").read(); os.remove(tmp)
bd = uuid.uuid4().hex
def part(name, val): return f"--{bd}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{val}\r\n".encode()
body = b"".join([part("model", "whisper-large-v3"), part("language", "ru"), part("response_format", "verbose_json"),
    part("timestamp_granularities[]", "segment"), part("timestamp_granularities[]", "word"), part("temperature", "0")])
body += f"--{bd}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"f.ogg\"\r\nContent-Type: audio/ogg\r\n\r\n".encode() + data + f"\r\n--{bd}--\r\n".encode()
req = urllib.request.Request("https://api.groq.com/openai/v1/audio/transcriptions", data=body, headers={"Authorization": f"Bearer {key}", "Content-Type": f"multipart/form-data; boundary={bd}", "User-Agent": "asr-client"})
r = json.load(urllib.request.urlopen(req, timeout=300))
for s in r.get("segments", []):
    t0, t1 = s["start"] + a, s["end"] + a
    print(f"{int(t0//60):02d}:{t0%60:04.1f}-{int(t1//60):02d}:{t1%60:04.1f}  {s['text'].strip()}")
if len(sys.argv) > 4:
    for w in r.get("words", []): w["start"] += a; w["end"] += a
    for s in r.get("segments", []): s["start"] += a; s["end"] += a
    json.dump(r, open(sys.argv[4], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
