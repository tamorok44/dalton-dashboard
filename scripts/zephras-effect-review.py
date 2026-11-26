import json,hashlib,re,unicodedata
from pathlib import Path
p=Path("evidence-capture")
def sha(b):return hashlib.sha256(b).hexdigest()
def norm(t):return " ".join(t.split()).replace("’","'")
def format_only(t):return re.sub(r"[^\w%+\-]", "",unicodedata.normalize("NFKC",norm(t)).casefold())
rawb=(p/"raw.json").read_bytes();deb=(p/"localized.json").read_bytes();zb=(p/"zephras-source.json").read_bytes()
assert sha((sha(rawb)+sha(deb)).encode())=="9600e28baa503d22d80ea631dc48f6844aa7be3b02576ff9bd7094e67b8e318b"
assert sha(zb)=="3a67ab3a76e57709a76a1bf04da1e3157600c4b81ccbad30e352a33e68f351ad"
raw=json.loads(rawb);de=json.loads(deb);z=json.loads(zb);rows=[]
for c in z["classes"]:
  a={t["id"]:t for cl in raw if cl["id"]==c["id"] for tr in cl["trees"] for t in tr["talents"]}
  for t in c["talents"]:
    n=a[t["id"]];x=n["d"];y=t["ranks"]
    if list(map(norm,x))==list(map(norm,y)):continue
    classification="format_only" if list(map(format_only,x))==list(map(format_only,y)) else "content_difference"
    rows.append({"classId":c["id"],"id":t["id"],"name":t["name"],"classification":classification,"primaryRankCount":len(x),"independentRankCount":len(y),"primaryHash":sha(json.dumps(x,ensure_ascii=False).encode()),"secondaryHash":sha(json.dumps(y,ensure_ascii=False).encode()),"primaryRankSpellIds":n["ranks"],"independentSpellId":t["spellId"],"deName":de[str(c["id"])]["talents"][str(t["id"])]["n"],"first":x[0],"otherFirst":y[0],"last":x[-1],"otherLast":y[-1]})
assert len(rows)==26
report={"schemaVersion":1,"kind":"effect_review","sourceSha256":sha(zb),"primarySourceRevision":sha((sha(rawb)+sha(deb)).encode()),"rows":rows,"legacy":z["talentedPerk"]}
(p/"effect-review.json").write_text(json.dumps(report,ensure_ascii=False,indent=2))
print("DALTON_EFFECT_REVIEW "+json.dumps(report,ensure_ascii=False))
