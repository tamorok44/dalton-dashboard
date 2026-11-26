import json, hashlib, urllib.request
from pathlib import Path
from collections import Counter
src="https://zephras.com/data/forever/enUS/talents/1.60.1.71139.json"
p=Path("evidence-capture")
def sha(b):return hashlib.sha256(b).hexdigest()
with urllib.request.urlopen(urllib.request.Request(src,headers={"User-Agent":"Dalton-Dashboard one-time evidence review"}),timeout=25) as res:
    b=res.read(2000000)
    if len(b)>=2000000:raise ValueError("capture limit")
(p/"zephras-source.json").write_bytes(b)
z=json.loads(b);assert z["format"]=="zephras-talents/1" and z["build"]=="1.60.1.71139"
raw=json.loads((p/"raw.json").read_text());de=json.loads((p/"localized.json").read_text())
assert len(z["classes"])==9
assert [x["level"] for x in z["pointsByLevel"]]==list(range(10,61))
assert sorted((x["rank"],x["firstPointLevel"]) for x in z["talentedPerk"])==[(i,10-i) for i in range(1,6)]
report={"source":src,"sha256":sha(b),"license":z["license"],"build":z["build"],"pointsByLevel":z["pointsByLevel"],"talentedPerk":z["talentedPerk"],"classes":[]}
for c in z["classes"]:
    cid=c["id"];primary=next(x for x in raw if x["id"]==cid)
    aa={t["id"]:(i,tr["id"],t) for i,tr in enumerate(primary["trees"]) for t in tr["talents"]}
    bb={t["id"]:t for t in c["talents"]}
    assert len(bb)==len(c["talents"])
    edges={}
    for a in c["arrows"]:edges.setdefault(a["to"],[]).append((a["from"],a["required"]))
    diff=[]; effects=[]; all_effects=[]
    for id in sorted(aa.keys()|bb.keys()):
        if id not in aa or id not in bb:diff.append({"id":id,"missing":"primary" if id not in aa else "secondary"});continue
        i,tree,t=aa[id];v=bb[id]
        pairs={"tree":[i,v["tree"]],"row":[t["row"],v["row"]-1],"column":[t["col"],v["column"]-1],"maxRank":[t["max"],v["maxRank"]],"points":[t["row"]*5,v["pointsInTreeRequired"]],"spell":[t["sp"],v["spellId"]],"edgeIds":[sorted(a[0] for a in t["pre"]),sorted(x[0] for x in edges.get(id,[]))]}
        delta={k:vals for k,vals in pairs.items() if vals[0]!=vals[1]}
        if any(not x[1] for x in edges.get(id,[])):delta["optionalEdges"]=edges[id]
        if any(len(a)!=2 for a in t["pre"]):delta["extraPrimaryCondition"]=t["pre"]
        if delta:diff.append({"id":id,"changes":delta})
        aa_text=t.get("d",[]);bb_text=v.get("ranks",[])
        norm=lambda s:" ".join(str(s).split()).replace("’","'")
        same=[norm(s) for s in aa_text]==[norm(s) for s in bb_text]
        if not same:effects.append({"id":id,"primaryRanks":len(aa_text),"secondaryRanks":len(bb_text),"primaryHash":sha(json.dumps(aa_text,ensure_ascii=False).encode()),"secondaryHash":sha(json.dumps(bb_text,ensure_ascii=False).encode())})
        all_effects.append({"id":id,"sameText":same,"name":v["name"],"maxRank":v["maxRank"]})
    targets=[{"id":id,"source":bb.get(id),"primary":aa[id][2] if id in aa else None,"arrows":edges.get(id,[])} for id in [104964,104961,104970,113631,105323,104923,104931,104933,104935,104936,104937,104924] if id in aa or id in bb]
    report["classes"].append({"classId":cid,"primaryCount":len(aa),"secondaryCount":len(bb),"structureDifferences":diff,"effectTextDifferences":effects,"effectTextMatches":len(all_effects)-len(effects),"targets":targets})
(p/"zephras-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
print("DALTON_ZEPHRAS_SUMMARY "+json.dumps({k:v for k,v in report.items() if k not in ("classes","pointsByLevel")}|{"classes":[{k:v for k,v in c.items() if k not in ("effectTextDifferences","targets")}|{"effectTextDifferenceCount":len(c["effectTextDifferences"]),"effectTextDifferenceIds":[x["id"] for x in c["effectTextDifferences"]],"targets":[{"id":t["id"],"name":t["source"]["name"],"maxRank":t["source"]["maxRank"],"spellId":t["source"]["spellId"],"arrows":t["arrows"],"ranks":t["source"]["ranks"]} for t in c["targets"]]} for c in report["classes"]]},ensure_ascii=False))
