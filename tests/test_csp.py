"""The Content-Security-Policy has to keep up with the pages it protects.

Scripts are allowed by hash, so editing any inline <script> - the 404 page's
base finder, or the slash fixer build_site.py writes into every topic page -
silently blocks it on Vercel and Render until the hash in vercel.json is
updated. These tests fail first instead, and print the hash to paste in.
"""

import base64
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
INLINE = re.compile(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S)


def csp():
    cfg = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))
    for rule in cfg["headers"]:
        for h in rule["headers"]:
            if h["key"] == "Content-Security-Policy":
                assert rule["source"] == "/(.*)", "the CSP must apply to every path"
                return h["value"]
    raise AssertionError("vercel.json has no Content-Security-Policy")


def directive(policy, name):
    for part in policy.split(";"):
        bits = part.split()
        if bits and bits[0] == name:
            return bits[1:]
    return []


def test_every_inline_script_is_allowed_by_hash():
    allowed = set(directive(csp(), "script-src"))
    missing = []
    for page in sorted(DOCS.rglob("*.html")):
        # Hashed exactly as the browser does: the raw text between the tags.
        text = page.read_bytes().decode("utf-8").replace("\r\n", "\n")
        for body in INLINE.findall(text):
            digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode()
            if "'sha256-%s'" % digest not in allowed:
                missing.append("%s: 'sha256-%s'" % (page.relative_to(ROOT), digest))
    assert not missing, "add to script-src in vercel.json:\n  " + "\n  ".join(missing)


def test_no_unsafe_script_sources():
    scripts = directive(csp(), "script-src")
    assert "'unsafe-inline'" not in scripts and "'unsafe-eval'" not in scripts


def test_policy_allows_the_supabase_project_the_site_ships_with():
    url = re.search(r'url:\s*"([^"]+)"', (DOCS / "auth-config.js").read_text(encoding="utf-8")).group(1)
    assert url in directive(csp(), "connect-src"), "sign-in would be blocked by the CSP"


def test_supabase_js_host_is_allowed():
    host = re.search(r'"(https://[^/"]+)/@supabase/', (DOCS / "auth.js").read_text(encoding="utf-8")).group(1)
    assert host in directive(csp(), "script-src")


def test_server_sends_the_same_policy():
    import server

    assert server.CSP == csp()
