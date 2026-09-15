"""Serve docs/ as a Render Web Service.

The site is static, so this is deliberately thin - it exists because a Render
Web Service must bind $PORT rather than a fixed one, and because the stock
http.server defaults are wrong for a deployed site in three ways: it binds
localhost only, it sends no cache headers, and on older Pythons it guesses the
wrong MIME type for .js on some systems.

Local:   python server.py            -> http://localhost:8000
Render:  python server.py            -> binds 0.0.0.0:$PORT
"""

import os
import json
import mimetypes
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent / "docs"
PORT = int(os.environ.get("PORT", 8000))

# Supabase credentials may come from the environment instead of the committed
# docs/auth-config.js, so one repo can point at a dev project locally and the
# real one on Render without editing a tracked file.
#
# Neither value is a secret - the publishable key is a browser key and reaches
# every visitor either way. Row Level Security is what protects the data. The
# service_role / sb_secret key must never be set here.
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = (os.environ.get("SUPABASE_PUBLISHABLE_KEY")
                or os.environ.get("SUPABASE_ANON_KEY", ""))


def auth_config_js():
    """The generated docs/auth-config.js, or None to serve the file on disk."""
    if not (SUPABASE_URL and SUPABASE_KEY):
        return None
    body = [
        "/* Generated from the environment by server.py - not the file on disk. */",
        "window.SUPABASE_CONFIG = {",
        "  url: " + json.dumps(SUPABASE_URL) + ",",
        "  anonKey: " + json.dumps(SUPABASE_KEY),
        "};",
        "",
    ]
    return "\n".join(body).encode("utf-8")

# Some minimal Linux images ship an /etc/mime.types that maps .js to
# text/plain, which a browser refuses to execute as a module. Be explicit.
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")


class Handler(SimpleHTTPRequestHandler):
    def generated(self):
        """Headers for the env-built auth-config.js, or None to fall through."""
        if self.path.split("?")[0] != "/auth-config.js":
            return None
        body = auth_config_js()
        if body is None:
            return None
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        return body

    def do_GET(self):
        body = self.generated()
        if body is None:
            return super().do_GET()
        self.wfile.write(body)

    def do_HEAD(self):
        # Must go through the same branch as GET, or HEAD advertises the length
        # of the file on disk while GET sends the generated one.
        if self.generated() is None:
            return super().do_HEAD()

    def send_error(self, code, message=None, explain=None):
        # SimpleHTTPRequestHandler's built-in 404 is an unstyled scrap of HTML.
        # Vercel serves docs/404.html for this automatically; do the same here
        # so a bad link looks the same on both hosts.
        page = ROOT / "404.html"
        if code == 404 and page.exists():
            body = page.read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def end_headers(self):
        path = self.path.split("?")[0]
        # No filename here is fingerprinted, so a cached .js or .css is served
        # against a newer .html for as long as the cache lives - the page loads,
        # and one stale script quietly behaves like last week's build. Caching
        # markup for five minutes and code for five minutes is the same bug.
        #
        # Everything the site is made of is small and revalidates in one round
        # trip, so all of it is no-cache. Longer lives are for assets that can
        # carry a hash in the name, and there are none yet.
        if path.endswith((".html", ".js", ".css", "/")):
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=300, must-revalidate")

        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Render captures stdout; the default logs to stderr and paints every
        # request red in the dashboard.
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


def main():
    if not (ROOT / "index.html").exists():
        raise SystemExit(f"no site to serve at {ROOT} - run: python build_site.py")

    if SUPABASE_URL and SUPABASE_KEY:
        print(f"auth-config.js from the environment ({SUPABASE_URL})", flush=True)
    else:
        print("auth-config.js from docs/ (set SUPABASE_URL + "
              "SUPABASE_PUBLISHABLE_KEY to override)", flush=True)

    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), partial(Handler, directory=str(ROOT)))
    print(f"serving {ROOT} on http://0.0.0.0:{PORT}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


if __name__ == "__main__":
    main()
