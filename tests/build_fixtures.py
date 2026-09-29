"""Shared helpers for the tests/test_build_*.py files.

Each test builds a small throwaway repository in a temp directory rather than
the real one, so a test can break a folder or a field without touching the
checkout - and so the real docs/ is only ever written by build_site.py itself.
"""

import json
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

import build_site  # noqa: E402

SITE = "https://example.test/sub/"


def topic(tid="alpha-topic", group="math", **over):
    t = {
        "id": tid,
        "title": f"Title of {tid}",
        "subject": "Maths AA HL",
        "syllabus": "AHL 1.1",
        "folder": f"{group}/{tid}",
        "script": tid.replace("-", "_") + ".py",
        "notebook": tid.replace("-", "_") + ".ipynb",
        "tags": ["one", "two"],
        "hard_bit": "The hard bit.",
        "shows": "What it shows.",
    }
    t.update(over)
    return t


def make_tree(root, topics, demos=("taylor", "projectile"), files=True):
    """A minimal repo at root: the real index.html template, a demos.js with
    the given builders, topics.json, and the folders its entries name."""
    root = Path(root)
    docs = root / "docs"
    docs.mkdir(parents=True, exist_ok=True)
    shutil.copy(REPO / "docs" / "index.html", docs / "index.html")
    body = ",\n".join(f"    {d}: demo{d.capitalize()}" for d in demos)
    (docs / "demos.js").write_text(
        "(function () {\n  var BUILDERS = {\n" + body + "\n  };\n})();\n", encoding="utf-8")
    (root / "topics.json").write_text(
        json.dumps(topics, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if files:
        for t in topics:
            if not all(isinstance(t.get(k), str) for k in ("folder", "script", "notebook")):
                continue
            folder = root / t["folder"]
            folder.mkdir(parents=True, exist_ok=True)
            (folder / t["script"]).write_text("print('hi')\n", encoding="utf-8")
            (folder / t["notebook"]).write_text("{}\n", encoding="utf-8")
    return root
