"""build_site.validate: every bad topics.json case fails loudly, by name."""

import pytest

from build_fixtures import REPO, SITE, build_site, make_tree, topic


def problems(tmp_path, topics, **kw):
    make_tree(tmp_path, topics, **kw)
    with pytest.raises(build_site.BuildError) as e:
        build_site.build(tmp_path, SITE, quiet=True)
    return str(e.value)


def test_valid_tree_builds(tmp_path):
    make_tree(tmp_path, [topic("alpha-topic", demo="taylor"), topic("beta-topic")])
    build_site.build(tmp_path, SITE, quiet=True)
    assert (tmp_path / "docs" / "t" / "alpha-topic" / "index.html").exists()


def test_the_real_topics_json_is_valid():
    build_site.validate(build_site.load_topics(REPO), REPO)


@pytest.mark.parametrize("field", [f for f, _ in build_site.REQUIRED])
def test_missing_required_field(tmp_path, field):
    t = topic()
    del t[field]
    msg = problems(tmp_path, [t])
    assert f'missing required field "{field}"' in msg


@pytest.mark.parametrize("field,value", [
    ("title", ""), ("title", 3), ("tags", "series"), ("tags", ["ok", ""]), ("shows", None),
])
def test_wrong_type_for_required_field(tmp_path, field, value):
    msg = problems(tmp_path, [topic(**{field: value})])
    assert f'"{field}" must be' in msg


def test_duplicate_ids(tmp_path):
    msg = problems(tmp_path, [topic("same-id"), topic("same-id", group="physics")])
    assert "same-id: duplicate id (entries 0 and 1)" in msg


def test_id_must_be_url_safe(tmp_path):
    msg = problems(tmp_path, [topic("Bad_Id")])
    assert "id must be lowercase words joined by hyphens" in msg


def test_missing_folder(tmp_path):
    msg = problems(tmp_path, [topic()], files=False)
    assert 'folder "math/alpha-topic" does not exist' in msg


@pytest.mark.parametrize("field", ["script", "notebook"])
def test_missing_script_or_notebook(tmp_path, field):
    make_tree(tmp_path, [topic()])
    t = topic()
    (tmp_path / t["folder"] / t[field]).unlink()
    with pytest.raises(build_site.BuildError) as e:
        build_site.build(tmp_path, SITE, quiet=True)
    assert f'{field} "{t["folder"]}/{t[field]}" does not exist' in str(e.value)


def test_folder_must_end_in_id(tmp_path):
    msg = problems(tmp_path, [topic("alpha-topic", folder="math/something-else")])
    assert 'folder "math/something-else" must end in the id ("alpha-topic")' in msg


def test_demo_without_builder(tmp_path):
    msg = problems(tmp_path, [topic(demo="nonesuch")])
    assert 'demo "nonesuch" has no builder in docs/demos.js' in msg
    assert "known: projectile, taylor" in msg


def test_demo_builders_read_from_the_real_demos_js():
    names = build_site.demo_builders(REPO)
    assert names and {"taylor", "projectile", "boltzmann", "orbitals"} <= names


def test_every_problem_is_reported_at_once(tmp_path):
    bad = topic("beta-topic", demo="nonesuch")
    del bad["shows"]
    msg = problems(tmp_path, [topic(folder="math/wrong"), bad])
    assert msg.startswith("topics.json has 2 problems:")


@pytest.mark.parametrize("field,value", [
    ("try_changing", ["N_TERMS - how many terms"]),
    ("equations", [{"tex": "e^{i\\pi} + 1 = 0", "caption": "Euler"}]),
    ("questions", [{"q": "Why?", "a": "Because."}]),
])
def test_optional_fields_allowed_when_well_formed(tmp_path, field, value):
    make_tree(tmp_path, [topic(**{field: value})])
    build_site.build(tmp_path, SITE, quiet=True)


@pytest.mark.parametrize("field,value", [
    ("try_changing", "just a string"),
    ("try_changing", [1, 2]),
    ("equations", [{"tex": "x"}]),
    ("equations", ["x = 1"]),
    ("questions", [{"q": "Why?", "a": 42}]),
    ("questions", {"q": "Why?", "a": "Because."}),
    ("demo", 7),
])
def test_optional_fields_type_checked_when_present(tmp_path, field, value):
    msg = problems(tmp_path, [topic(**{field: value})])
    assert f'"{field}" must be' in msg


def test_unknown_fields_pass_through(tmp_path):
    make_tree(tmp_path, [topic(something_new={"any": "shape"})])
    build_site.build(tmp_path, SITE, quiet=True)
    assert "something_new" in (tmp_path / "docs" / "topics.js").read_text(encoding="utf-8")


def test_cli_prints_the_problem_and_exits_nonzero(tmp_path, capsys):
    make_tree(tmp_path, [topic(demo="nonesuch")])
    assert build_site.main(["--root", str(tmp_path)]) == 1
    err = capsys.readouterr().err
    assert "build_site.py: topics.json has 1 problem:" in err
    assert "Traceback" not in err


def test_invalid_json_is_reported(tmp_path):
    make_tree(tmp_path, [topic()])
    (tmp_path / "topics.json").write_text("[{,}]", encoding="utf-8")
    with pytest.raises(build_site.BuildError, match="not valid JSON"):
        build_site.build(tmp_path, SITE, quiet=True)
