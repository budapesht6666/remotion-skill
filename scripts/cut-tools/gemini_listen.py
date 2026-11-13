"""usage: python scripts/cut-tools/gemini_listen.py <video> <from> <to> — дословная расшифровка фрагмента Gemini."""
import sys, subprocess, base64, json, urllib.request, os, tempfile, uuid
v, a, b = sys.argv[1], sys.argv[2], sys.argv[3]
ENV = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.env')
key = [l.split('=',1)[1].strip().strip('"') for l in open(ENV, encoding='utf-8') if l.startswith('GEMINI_API_KEY=')][0]
tmp = os.path.join(tempfile.gettempdir(), f'g_{uuid.uuid4().hex}.mp3')
subprocess.run(['ffmpeg','-v','error','-y','-ss',a,'-to',b,'-i',v,'-map','0:a:0','-ac','1','-ar','16000',tmp],check=True)
data = base64.b64encode(open(tmp,'rb').read()).decode(); os.remove(tmp)
body = {"contents":[{"parts":[{"text":"Дословно расшифруй русскую речь в этом фрагменте сериала. Только текст, без комментариев."},{"inline_data":{"mime_type":"audio/mp3","data":data}}]}]}
req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={key}', data=json.dumps(body).encode(), headers={'Content-Type':'application/json'})
r = json.load(urllib.request.urlopen(req, timeout=120))
print(r['candidates'][0]['content']['parts'][0]['text'])
