"""Generate the site's data files from the sources in the repository.

  docs/topics.js:  topics.json plus the real Python sources, embedded at
                     build time so the site never keeps its own copy of the code.
  docs/content.js: the subject graph, lessons and question bank from content/,
                     validated so a typo in an id fails the build instead of
                     quietly leaving a dangling edge or an unanswerable question.

Run:  python build_site.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).parent
CONTENT = ROOT / "content"
REPO = "https://github.com/iyu210-tech/Capstone_Repository"

EDGE_TYPES = {"prerequisite", "application", "similarity"}
SPECS = {"current", "extension", "legacy"}
FORMATS = {"mcq", "numeric", "short"}
SKILLS = {"concept", "calculation", "interpretation", "multi-step"}


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise SystemExit(f"{path.relative_to(ROOT)}: {e}")


def build_topics():
    topics = load(ROOT / "topics.json")

    for t in topics:
        folder = ROOT / t["folder"]
        script = folder / t["script"]
        if not script.exists():
            raise SystemExit(f"missing script: {script}")

        t["source"] = script.read_text(encoding="utf-8")
        t["script_url"] = f"{t['folder']}/{t['script']}"
        t["notebook_url"] = f"{REPO}/blob/main/{t['folder']}/{t['notebook']}"
        t["colab_url"] = (
            f"https://colab.research.google.com/github/iyu210-tech/"
            f"Capstone_Repository/blob/main/{t['folder']}/{t['notebook']}"
        )

    write_js("topics.js", "TOPICS", topics)
    return {t["id"] for t in topics}


def build_content(topic_ids):
    errors = []
    graph = load(CONTENT / "graph.json")

    subjects = {s["id"]: s for s in graph["subjects"]}
    clusters = {(s["id"], c["id"]) for s in graph["subjects"] for c in s["clusters"]}

    nodes = {}
    for n in graph["nodes"]:
        where = f"node {n.get('id')}"
        if n["id"] in nodes:
            errors.append(f"{where}: duplicate id")
        nodes[n["id"]] = n
        if n["subject"] not in subjects:
            errors.append(f"{where}: unknown subject {n['subject']}")
        if (n["subject"], n["cluster"]) not in clusters:
            errors.append(f"{where}: unknown cluster {n['cluster']}")
        if n.get("spec", "current") not in SPECS:
            errors.append(f"{where}: spec must be one of {sorted(SPECS)}")
        if n.get("difficulty") not in (1, 2, 3, 4):
            errors.append(f"{where}: difficulty must be 1, 2, 3 or 4")

    seen = set()
    for e in graph["edges"]:
        where = f"edge {e['from']} -> {e['to']}"
        for end in (e["from"], e["to"]):
            if end not in nodes:
                errors.append(f"{where}: unknown node {end}")
        if e["type"] not in EDGE_TYPES:
            errors.append(f"{where}: type must be one of {sorted(EDGE_TYPES)}")
        key = frozenset((e["from"], e["to"]))
        if key in seen:
            errors.append(f"{where}: connected twice")
        seen.add(key)
        # A cross-subject link is only worth drawing if it says why it exists.
        if (e["from"] in nodes and e["to"] in nodes
                and nodes[e["from"]]["subject"] != nodes[e["to"]]["subject"]
                and not e.get("note")):
            errors.append(f"{where}: cross-subject edges need a note")

    questions = []
    for path in sorted((CONTENT / "questions").glob("*.json")):
        questions.extend(load(path))

    qids = set()
    for q in questions:
        where = f"question {q.get('id')}"
        if q["id"] in qids:
            errors.append(f"{where}: duplicate id")
        qids.add(q["id"])
        if q["node"] not in nodes:
            errors.append(f"{where}: unknown node {q['node']}")
        if q["format"] not in FORMATS:
            errors.append(f"{where}: format must be one of {sorted(FORMATS)}")
        if q.get("skill") not in SKILLS:
            errors.append(f"{where}: skill must be one of {sorted(SKILLS)}")
        if q.get("difficulty") not in (1, 2, 3):
            errors.append(f"{where}: difficulty must be 1, 2 or 3")
        if not str(q.get("prompt", "")).strip():
            errors.append(f"{where}: needs a prompt")
        if not q.get("hints") or not q.get("solution"):
            errors.append(f"{where}: needs at least one hint and a worked solution")
        if q["format"] == "mcq":
            right = [c for c in q.get("choices", []) if c.get("correct")]
            if len(right) != 1:
                errors.append(f"{where}: needs exactly one correct choice")
            for c in q.get("choices", []):
                if not c.get("correct") and not c.get("why"):
                    errors.append(f"{where}: wrong choice '{c['text']}' needs a 'why'")
        if q["format"] == "numeric":
            a = q.get("answer", {})
            if "value" not in a or not ("tol" in a or "abs" in a):
                errors.append(f"{where}: numeric answers need a value and a tol or abs")
        if q["format"] == "short":
            a = q.get("answer", {})
            if not isinstance(a, dict) or not str(a.get("text", "")).strip():
                errors.append(f"{where}: short answers need answer.text")
            accept = a.get("accept", [])
            if accept is not None and not isinstance(accept, list):
                errors.append(f"{where}: answer.accept must be a list of strings")
        q.setdefault("syllabus", nodes.get(q["node"], {}).get("syllabus", ""))

    lessons = {}
    for path in sorted((CONTENT / "lessons").glob("*.json")):
        lesson = load(path)
        where = f"lesson {path.name}"
        if lesson["node"] not in nodes:
            errors.append(f"{where}: unknown node {lesson['node']}")
        if path.stem != lesson["node"]:
            errors.append(f"{where}: file name must match its node id")
        if lesson.get("topic") and lesson["topic"] not in topic_ids:
            errors.append(f"{where}: unknown topic {lesson['topic']}")
        for key in ("objectives", "explanation", "examples", "takeaways"):
            if not lesson.get(key):
                errors.append(f"{where}: missing {key}")
        if not any(q["node"] == lesson["node"] for q in questions):
            errors.append(f"{where}: no practice questions for this node")
        lessons[lesson["node"]] = lesson

    if errors:
        raise SystemExit("content errors:\n  " + "\n  ".join(errors))

    write_js("content.js", "CONTENT", {
        "specs": graph["specs"],
        "subjects": graph["subjects"],
        "nodes": graph["nodes"],
        "edges": graph["edges"],
        "lessons": lessons,
        "questions": questions,
    })


def write_js(name, var, data):
    out = ROOT / "docs" / name
    out.parent.mkdir(exist_ok=True)
    payload = json.dumps(data, indent=1, ensure_ascii=False)
    out.write_text(
        "// GENERATED by build_site.py. Do not edit by hand.\n"
        f"window.{var} = {payload};\n",
        encoding="utf-8",
    )
    print(f"wrote {out.relative_to(ROOT)} ({out.stat().st_size:,} bytes)")


def main():
    topic_ids = build_topics()
    build_content(topic_ids)


if __name__ == "__main__":
    main()
