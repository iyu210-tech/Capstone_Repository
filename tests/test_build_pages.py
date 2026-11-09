"""Generated pages, SITE_URL, sitemap and robots."""

import json
import re
import xml.etree.ElementTree as ET

import pytest

from build_fixtures import REPO, SITE, build_site, make_tree, topic

TRICKY = "Forces & <vectors>"


@pytest.fixture
def built(tmp_path):
    make_tree(tmp_path, [
        topic("alpha-topic", title=TRICKY, demo="taylor",
              hard_bit='Quotes " and <b>tags</b> & ampersands.',
              try_changing=["<N> - more"], questions=[{"q": "1 < 2?", "a": "Yes & no."}]),
        topic("beta-topic", group="physics", subject="Physics HL"),
    ])
    build_site.build(tmp_path, SITE, quiet=True)
    return tmp_path


def page(root, tid):
    return (root / "docs" / "t" / tid / "index.html").read_text(encoding="utf-8")


def test_a_page_per_topic(built):
    for tid in ("alpha-topic", "beta-topic"):
        assert (built / "docs" / "t" / tid / "index.html").is_file()
        assert (built / "docs" / "og" / f"{tid}.png").is_file()
    assert (built / "docs" / "og" / "home.png").is_file()


def test_title_and_text_are_escaped(built):
    doc = page(built, "alpha-topic")
    assert "<title>Forces &amp; &lt;vectors&gt; — IB HL Visualisations</title>" in doc
    assert '<meta property="og:title" content="Forces &amp; &lt;vectors&gt;">' in doc
    assert '<h1 tabindex="-1">Forces &amp; &lt;vectors&gt;</h1>' in doc
    assert "Quotes &quot; and &lt;b&gt;tags&lt;/b&gt; &amp; ampersands." in doc
    assert "<li>&lt;N&gt; - more</li>" in doc
    assert "<summary>1 &lt; 2?</summary><p>Yes &amp; no.</p>" in doc
    assert "<vectors>" not in doc and "<b>tags" not in doc


def test_canonical_and_previews_point_at_site_url(built):
    doc = page(built, "beta-topic")
    url = SITE + "t/beta-topic/"
    assert f'<link rel="canonical" href="{url}">' in doc
    assert f'<meta property="og:url" content="{url}">' in doc
    assert f'<meta property="og:image" content="{SITE}og/beta-topic.png">' in doc
    assert f'<meta name="twitter:image" content="{SITE}og/beta-topic.png">' in doc
    assert '<meta property="og:type" content="article">' in doc
    assert '<meta name="description" content="What it shows.">' in doc
    # One of each: the template's home-page values must not survive alongside.
    assert doc.count('rel="canonical"') == 1
    assert doc.count('property="og:url"') == 1


def test_home_page_follows_site_url(built):
    doc = (built / "docs" / "index.html").read_text(encoding="utf-8")
    assert f'<link rel="canonical" href="{SITE}">' in doc
    assert f'<meta property="og:url" content="{SITE}">' in doc
    assert f'<meta property="og:image" content="{SITE}og/home.png">' in doc
    assert build_site.MARKER not in doc   # the template is not itself generated


def test_static_content_replaces_the_skeleton(built):
    doc = page(built, "beta-topic")
    main = re.search(r'<main id="view"[^>]*>(.*?)</main>', doc, re.S).group(1)
    assert "skeleton" not in main
    assert "The hard bit." in main and "What it shows." in main
    assert 'href="../../"' in main


def test_assets_are_rebased_and_marker_follows_doctype(built):
    doc = page(built, "alpha-topic")
    assert doc.startswith("<!doctype html>\n<!-- " + build_site.MARKER)
    assert 'href="../../style.css"' in doc
    for js in ("topics.js", "demos.js", "app.js", "nav.js", "auth-config.js", "auth.js"):
        assert f'src="../../{js}"' in doc
    # Fragments inside the templates stay fragments - the router owns them.
    assert 'href="#/"' in doc and 'href="#view"' in doc
    assert 'href="https://github.com/iyu210-tech/Capstone_Repository"' in doc


def test_sitemap_and_robots(built):
    tree = ET.parse(built / "docs" / "sitemap.xml")
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locs = [e.text for e in tree.getroot().findall("s:url/s:loc", ns)]
    assert locs == [SITE, SITE + "t/alpha-topic/", SITE + "t/beta-topic/"]
    robots = (built / "docs" / "robots.txt").read_text(encoding="utf-8")
    assert f"Sitemap: {SITE}sitemap.xml" in robots


def test_second_build_changes_nothing(built):
    assert build_site.build(built, SITE, quiet=True) == []


def test_removed_topic_is_pruned(built):
    topics = json.loads((built / "topics.json").read_text(encoding="utf-8"))
    (built / "topics.json").write_text(json.dumps(topics[:1]), encoding="utf-8")
    build_site.build(built, SITE, quiet=True)
    assert not (built / "docs" / "t" / "beta-topic").exists()
    assert not (built / "docs" / "og" / "beta-topic.png").exists()
    assert (built / "docs" / "t" / "alpha-topic" / "index.html").exists()


def test_hand_written_pages_are_not_pruned(built):
    mine = built / "docs" / "t" / "handmade"
    mine.mkdir()
    (mine / "index.html").write_text("<p>mine</p>", encoding="utf-8")
    build_site.build(built, SITE, quiet=True)
    assert (mine / "index.html").exists()


def test_template_missing_a_tag_fails_loudly(tmp_path):
    make_tree(tmp_path, [topic()])
    index = tmp_path / "docs" / "index.html"
    text = index.read_text(encoding="utf-8")
    index.write_text(re.sub(r'<meta property="og:image" [^>]*>\n', "", text), encoding="utf-8")
    with pytest.raises(build_site.BuildError, match="og:image"):
        build_site.build(tmp_path, SITE, quiet=True)


@pytest.mark.parametrize("raw,want", [
    ("https://example.vercel.app", "https://example.vercel.app/"),
    ("https://example.vercel.app///", "https://example.vercel.app/"),
    (" https://a.b/sub ", "https://a.b/sub/"),
    ("", build_site.DEFAULT_SITE_URL),
])
def test_site_url_normalised(raw, want):
    assert build_site.site_url(raw) == want


def test_site_url_read_from_environment(monkeypatch):
    monkeypatch.setenv("SITE_URL", "https://ib-hl.onrender.com")
    assert build_site.site_url() == "https://ib-hl.onrender.com/"
    monkeypatch.delenv("SITE_URL")
    assert build_site.site_url() == build_site.DEFAULT_SITE_URL


def test_site_url_rejects_relative():
    with pytest.raises(build_site.BuildError, match="SITE_URL"):
        build_site.site_url("example.com/")


def test_committed_pages_match_topics_json():
    """The real docs/ has a page per topic, built for the default SITE_URL.

    CI's staleness check catches any drift byte for byte; this says which
    page is wrong when it does.
    """
    for t in build_site.load_topics(REPO):
        doc = page(REPO, t["id"])
        url = build_site.DEFAULT_SITE_URL + f"t/{t['id']}/"
        assert f'<link rel="canonical" href="{url}">' in doc, t["id"]
        assert f"<title>{build_site.esc(t['title'])} — " in doc, t["id"]
