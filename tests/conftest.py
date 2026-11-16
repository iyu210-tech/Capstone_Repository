"""Test files pytest skips for now.

build_site.py was rebuilt on 9 Nov (afa5d63): it now writes only
docs/topics.js and docs/content.js. These files test the September build it
replaced (the /t/ topic pages, preview PNGs, sitemap, robots.txt, SITE_URL
and topics.json validation), and scripts/new_topic.py, which still calls that
old API. They stay in the repo for reference until they are ported to the
new build or deleted.
"""

collect_ignore = [
    "test_build_pages.py",
    "test_build_png.py",
    "test_build_validation.py",
    "test_build_new_topic.py",
]
