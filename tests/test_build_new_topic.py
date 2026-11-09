"""scripts/new_topic.py scaffolds something that validates and builds."""

import json
import sys

import pytest

from build_fixtures import REPO, SITE, build_site, make_tree, topic

sys.path.insert(0, str(REPO / "scripts"))
import new_topic  # noqa: E402


@pytest.fixture
def repo(tmp_path):
    return make_tree(tmp_path, [topic("alpha-topic", title="Café — dash")])


def test_scaffold_validates_and_builds(repo):
    before = (repo / "topics.json").read_text(encoding="utf-8")
    assert new_topic.main(["physics", "simple-harmonic-motion", "--root", str(repo),
                           "--syllabus", "Theme C"]) == 0

    folder = repo / "physics" / "simple-harmonic-motion"
    script = folder / "simple_harmonic_motion.py"
    notebook = folder / "simple_harmonic_motion.ipynb"
    assert script.is_file() and notebook.is_file() and (folder / "README.md").is_file()

    build_site.build(repo, SITE, quiet=True)
    page = repo / "docs" / "t" / "simple-harmonic-motion" / "index.html"
    assert "<title>Simple harmonic motion — IB HL Visualisations</title>" in \
        page.read_text(encoding="utf-8")

    # The existing entries are kept exactly as written, formatting included.
    after = (repo / "topics.json").read_text(encoding="utf-8")
    assert after.startswith(before.rstrip()[:-1].rstrip() + ",\n  {\n    \"id\": \"simple-harmonic-motion\",")
    assert "Café — dash" in after
    entry = json.loads(after)[-1]
    assert entry["subject"] == "Physics HL" and entry["syllabus"] == "Theme C"
    assert entry["folder"] == "physics/simple-harmonic-motion"
    assert all("TODO" in entry[k] for k in ("hard_bit", "shows"))


def test_scaffolded_files_are_usable(repo):
    new_topic.main(["math", "complex-numbers", "--root", str(repo), "--title", "Complex numbers"])
    folder = repo / "math" / "complex-numbers"

    src = (folder / "complex_numbers.py").read_text(encoding="utf-8")
    compile(src, "complex_numbers.py", "exec")
    assert "python complex_numbers.py" in src

    nb = json.loads((folder / "complex_numbers.ipynb").read_text(encoding="utf-8"))
    assert nb["nbformat"] == 4 and nb["nbformat_minor"] >= 5
    assert [c["cell_type"] for c in nb["cells"]] == ["markdown", "code"]
    assert all(c.get("id") for c in nb["cells"])
    assert "".join(nb["cells"][1]["source"]) == src.rstrip("\n")

    readme = (folder / "README.md").read_text(encoding="utf-8")
    for section in ("**Subject:** Maths AA HL", "**The hard bit:**",
                    "**What this shows:**", "## Try changing"):
        assert section in readme


def test_real_topics_json_formatting_survives_an_append():
    text = (REPO / "topics.json").read_text(encoding="utf-8")
    out = new_topic.append_entry(text, topic("zzz-topic"))
    assert out.startswith(text.rstrip()[:-1].rstrip() + ",\n")
    assert json.loads(out) == json.loads(text) + [topic("zzz-topic")]
    assert out.endswith("  }\n]\n")


def test_first_entry_in_an_empty_list():
    out = new_topic.append_entry("[]\n", {"id": "x"})
    assert out == '[\n  {\n    "id": "x"\n  }\n]\n'


@pytest.mark.parametrize("args,msg", [
    (["math", "alpha-topic"], "already has a topic"),
    (["math", "Bad_Name"], "lowercase words joined by hyphens"),
    (["economics", "supply-demand"], "pass --subject"),
])
def test_refuses_bad_input(repo, args, msg):
    before = (repo / "topics.json").read_text(encoding="utf-8")
    with pytest.raises(SystemExit, match=msg):
        new_topic.main(args + ["--root", str(repo)])
    assert (repo / "topics.json").read_text(encoding="utf-8") == before


def test_refuses_existing_folder(repo):
    (repo / "math" / "taken").mkdir(parents=True)
    with pytest.raises(SystemExit, match="already exists"):
        new_topic.main(["math", "taken", "--root", str(repo)])
