"""server.py serves the generated topic pages the way the other hosts do."""

import http.client
import threading
from functools import partial
from http.server import ThreadingHTTPServer

import pytest

from build_fixtures import REPO, build_site

import server  # noqa: E402  (build_fixtures put the repo on sys.path)


@pytest.fixture(scope="module")
def base():
    # A quiet subclass: the per-request log line is noise in a test run.
    quiet = type("Quiet", (server.Handler,), {"log_message": lambda *a: None})
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), partial(quiet, directory=str(REPO / "docs")))
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield httpd.server_address
    httpd.shutdown()
    httpd.server_close()


def get(addr, path):
    c = http.client.HTTPConnection(*addr, timeout=5)
    c.request("GET", path)
    r = c.getresponse()
    body = r.read()
    c.close()
    return r, body


def first_id():
    return build_site.load_topics(REPO)[0]["id"]


def test_topic_page_is_served(base):
    tid = first_id()
    r, body = get(base, f"/t/{tid}/")
    assert r.status == 200
    assert r.getheader("Cache-Control") == "no-cache"
    assert f'/t/{tid}/">' in body.decode("utf-8")   # its own canonical


def test_bare_topic_path_redirects_to_the_slash(base):
    tid = first_id()
    r, _ = get(base, f"/t/{tid}")
    assert r.status == 301
    assert r.getheader("Location") == f"/t/{tid}/"


def test_unknown_topic_gets_the_styled_404(base):
    r, body = get(base, "/t/no-such-topic/")
    assert r.status == 404
    assert b"That page is not here" in body


def test_generated_files_are_served(base):
    for path, kind in (("/sitemap.xml", "xml"), ("/robots.txt", "text/plain"),
                       ("/og/home.png", "image/png")):
        r, _ = get(base, path)
        assert r.status == 200, path
        assert kind in r.getheader("Content-Type"), path
