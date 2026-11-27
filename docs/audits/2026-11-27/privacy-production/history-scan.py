#!/usr/bin/env python3
"""Read-only inventory of fetched Git history. Never output matching bytes,
paths containing possible credentials, author addresses or commit identifiers
associated with matches. Regex results are leads, not proof of usable secrets."""
import subprocess, re, json, collections, sys
def git(*args):
    return subprocess.check_output(["git",*args])
patterns={
    "github_classic":rb"(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{36,255}(?![A-Za-z0-9])",
    "github_fine_grained":rb"github_pat_[A-Za-z0-9_]{60,255}",
    "vercel_blob_rw":rb"vercel_blob_rw_[A-Za-z0-9_]{20,255}",
    "dalton_device":rb"(?<![A-Za-z0-9_-])ddv1_[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])",
    "aws_access_key":rb"(?:AKIA|ASIA)[A-Z0-9]{16}",
    "private_key_header":rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----",
    "slack_token":rb"xox[baprs]-[A-Za-z0-9-]{15,}",
    "discord_bot_token_shape":rb"(?<![A-Za-z0-9_-])[MN][A-Za-z0-9_-]{23,27}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,50}(?![A-Za-z0-9_-])",
    "literal_secret_assignment":rb"(?mi)^\s*(?:export\s+)?(?:BLIZZARD_CLIENT_SECRET|DALTON_SYNC_TOKEN|SPELLBOOK_SYNC_TOKEN|CRON_SECRET|KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN|FOREVERDB_API_KEY|BLOB_READ_WRITE_TOKEN|DALTON_PRIVATE_ARCHIVE_TOKEN)\s*=\s*['\"]?[A-Za-z0-9_+/=-]{20,}['\"]?\s*$"
}
compiled={k:re.compile(v) for k,v in patterns.items()}
def scan(refs):
    objects={}
    for line in git("rev-list","--objects",*refs).splitlines():
        obj,_,path=line.partition(b" ")
        objects[obj]=path
    proc=subprocess.Popen(["git","cat-file","--batch"],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
    counts=collections.Counter(); hits=collections.Counter()
    for obj,path in objects.items():
        proc.stdin.write(obj+b"\n");proc.stdin.flush()
        hdr=proc.stdout.readline().split()
        if len(hdr)!=3:
            counts["unreadable_objects"]+=1;continue
        size=int(hdr[2])
        content=proc.stdout.read(size);proc.stdout.read(1)
        if len(content)!=size:raise RuntimeError("incomplete git object")
        if hdr[1]!=b"blob":continue
        counts["blobs"]+=1
        if b"\x00" in content[:8192]:
            counts["binary_blobs_not_scanned"]+=1;continue
        counts["text_blobs_scanned"]+=1
        for key,pat in compiled.items():
            if pat.search(content):hits[key]+=1
    proc.stdin.close();proc.wait()
    return {"counts":dict(counts),"matching_blobs_by_pattern":dict(hits)}
def authors(refs):
    emails=set(git("log",*refs,"--format=%ae").splitlines())
    nonrelay=[x for x in emails if not re.search(rb"@(?:users\.)?noreply\.github\.com$",x,re.I)]
    return {"distinct_author_address_count":len(emails),"non_github_noreply_address_count":len(nonrelay)}
main=sys.argv[1]
print(json.dumps({"scope":"production ancestry","commit":main,**scan([main]),"author_metadata":authors([main])},sort_keys=True))
print(json.dumps({"scope":"all fetched refs",**scan(["--all"]),"author_metadata":authors(["--all"])},sort_keys=True))
