from html.parser import HTMLParser
from pathlib import Path
import json
class Inspector(HTMLParser):
    def __init__(self): super().__init__(); self.rows=[]; self.scripts=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=="script" and a.get("src"): self.scripts.append(a["src"])
        if len(self.rows)>=12: return
        if any("talent" in k or "talent" in str(v).lower() for k,v in a.items()) and (tag in ("button","div","li","a","template","script")):
            data={k:str(v)[:200] for k,v in a.items() if k.startswith("data-") or k in ("id","class","aria-label")}
            if data and any(k.startswith("data-") for k in data): self.rows.append({"tag":tag,"attrs":data})
for p in sorted(Path("evidence-capture").glob("hotfix-client-*.html")):
    x=Inspector(); x.feed(p.read_text())
    print("ALT_SCHEMA "+p.name+" "+json.dumps({"rows":x.rows,"scripts":x.scripts[:12]}))
