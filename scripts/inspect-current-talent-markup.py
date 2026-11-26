from html.parser import HTMLParser
from pathlib import Path
from collections import Counter
import json,re
class Inspect(HTMLParser):
    def __init__(self):
        super().__init__();self.count=Counter();self.samples={};self.islands=[];self.script=None;self.scripts=[];self.focus=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        for k,v in attrs:
            if k.startswith('data-') and not k.startswith('data-astro-'):
                self.count[k]+=1
                if k not in self.samples:self.samples[k]={"tag":tag,"attrs":{x:str(y)[:300] for x,y in a.items() if not x.startswith("data-astro-")}}
        if tag=="astro-island":
            props=a.get("props","")
            self.islands.append({"attributes":{k:str(v)[:300] for k,v in a.items() if k!="props"},"props_len":len(props),"props_head":props[:1000]})
        if tag=="script":self.script={"attrs":a,"text":""}
        if tag=="button" and any("talent" in str(v).lower() for v in a.values()) and len(self.focus)<8:
            self.focus.append({k:str(v)[:400] for k,v in a.items() if not k.startswith("data-astro-")})
    def handle_data(self,data):
        if self.script is not None:self.script["text"]+=data
    def handle_endtag(self,tag):
        if tag=="script" and self.script is not None:
            s=self.script
            self.scripts.append({"attrs":s["attrs"],"length":len(s["text"]),"head":s["text"][:400]})
            self.script=None
for p in sorted(Path("evidence-capture").glob("hotfix-client-*.html")):
    if p.name not in ["hotfix-client-11.html","hotfix-client-8.html"]:continue
    x=Inspect();x.feed(p.read_text())
    print("COUNTS "+p.name+" "+json.dumps(dict(x.count)))
    print("SAMPLES "+p.name+" "+json.dumps(x.samples))
    print("ISLANDS "+p.name+" "+json.dumps(x.islands[:8]))
    print("SCRIPTS "+p.name+" "+json.dumps(x.scripts[:15]))
    print("FOCUS "+p.name+" "+json.dumps(x.focus))
raw=json.loads(Path("evidence-capture/raw.json").read_text())
for class_id,ids in [(3,[104964,104961,104970]),(2,[113631,105323]),(11,[104923,104931,104933,104936,104937,104935,104924])]:
    c=next(c for c in raw if c["id"]==class_id)
    print("RAW_TARGET "+str(class_id)+" "+json.dumps([{"id":t["id"],"pre":t["pre"],"max":t["max"],"ranks":t["ranks"],"lv":t["lv"],"name":t.get("n"),"effects":t.get("d")} for tr in c["trees"] for t in tr["talents"] if t["id"] in ids]))
