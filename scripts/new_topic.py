"""Scaffold a new topic: folder, script, notebook, README and topics.json entry.

Every topic has the same shape - that is what makes the collection browsable
and what the website is built on - so the first ten minutes of a new one are
always the same ten minutes. This does them, and leaves TODO markers wherever
the thinking has to happen.

Run:  python scripts/new_topic.py math complex-numbers
      python scripts/new_topic.py physics shm --title "Simple harmonic motion" --syllabus "Theme C"

Then fill in the TODOs, run the notebook top to bottom, and python build_site.py.
Stdlib only, like build_site.py.
"""

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import build_site  # noqa: E402  (after the path fix, so it runs from anywhere)

# The subject names the site already uses, so a new topic lands under the
# same filter chip as the others in its folder.
SUBJECTS = {
    "math": "Maths AA HL",
    "maths": "Maths AA HL",
    "physics": "Physics HL",
    "chemistry": "Chemistry HL",
}


def script_text(title, subject, syllabus):
    return f'''"""{title} (IB HL {subject} - {syllabus}).

TODO: the idea in two or three sentences, for someone who has just met it -
what is hard about it, and what the figure below makes visible.

Run:  python {{name}}
"""

import numpy as np
import matplotlib.pyplot as plt

# Change these, re-run, and see what moves. They are the README's
# "Try changing" list.
N_POINTS = 400
X_RANGE = 3.0


def main():
    x = np.linspace(-X_RANGE, X_RANGE, N_POINTS)
    fig, ax = plt.subplots(figsize=(8, 4.5))
    ax.plot(x, np.sin(x))  # TODO: replace with the picture this topic needs
    ax.set_title({title!r})
    ax.grid(alpha=0.3)
    plt.show()


if __name__ == "__main__":
    main()
'''


def readme_text(title, subject, syllabus, script, notebook):
    return f"""# {title}

**Subject:** {subject} ({syllabus})

**The hard bit:** TODO - what students can do mechanically but do not
actually see.

**What this shows:** TODO - what the figure or animation makes visible, and
what to look for in it.

## Run it

Notebook (recommended - explanation and code side by side):
```
pip install numpy matplotlib jupyter
jupyter notebook {notebook}
```

Or just the figures:
```
python {script}
```

The notebook also opens in VS Code, or in Google Colab with nothing installed.

## Try changing
- `N_POINTS` - TODO: what changes when you do.
- `X_RANGE` - TODO: what changes when you do.
"""


def notebook_json(title, source):
    """The smallest notebook Jupyter, GitHub and Colab all open cleanly.

    nbformat 4.5, so each cell carries the id field that version requires;
    without one, Jupyter rewrites the file on first open and the diff is noise.
    """
    def lines(text):
        parts = text.splitlines(keepends=True)
        if parts:
            parts[-1] = parts[-1].rstrip("\n")
        return parts

    nb = {
        "cells": [
            {"cell_type": "markdown", "id": "intro", "metadata": {},
             "source": lines(f"# {title}\n\nTODO: the explanation, in the same "
                             "order as the README - the hard bit, then what the "
                             "figure shows.")},
            {"cell_type": "code", "id": "code", "metadata": {},
             "execution_count": None, "outputs": [], "source": lines(source)},
        ],
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }
    return json.dumps(nb, indent=1, ensure_ascii=False) + "\n"


def append_entry(text, entry):
    """topics.json with entry added at the end, the rest byte-for-byte kept.

    Inserted as text rather than load-and-redump, so whatever formatting the
    file has - 2-space indent, literal em dashes, key order - is left exactly
    as it was and the diff is only the new entry.
    """
    newline = "\r\n" if "\r\n" in text else "\n"
    body = text.replace("\r\n", "\n").rstrip()
    if not body.endswith("]"):
        raise SystemExit("topics.json does not end in ] - is it still a JSON list?")
    head = body[:-1].rstrip()
    block = "\n".join("  " + ln for ln in
                      json.dumps(entry, indent=2, ensure_ascii=False).splitlines())
    sep = "\n" if head.endswith("[") else ",\n"
    out = head + sep + block + "\n]\n"
    if json.loads(out) != json.loads(body) + [entry]:
        raise SystemExit("could not append to topics.json without changing it")
    return out.replace("\n", newline)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Scaffold a new topic.")
    ap.add_argument("subject_folder", help='top-level folder, e.g. "math", "physics", "chemistry"')
    ap.add_argument("topic_name", help='lowercase-with-hyphens, e.g. "complex-numbers"; '
                                       "also the topic's id and URL")
    ap.add_argument("--title", help="display title (default: from the topic name)")
    ap.add_argument("--subject", help='e.g. "Maths AA HL" (default: from the folder)')
    ap.add_argument("--syllabus", default="TODO", help='syllabus reference, e.g. "AHL 5.19"')
    ap.add_argument("--root", type=Path, default=ROOT, help=argparse.SUPPRESS)
    args = ap.parse_args(argv)

    root = args.root.resolve()
    name, group = args.topic_name, args.subject_folder.strip("/")
    if not build_site.ID_PATTERN.match(name):
        raise SystemExit(f"topic name {name!r} must be lowercase words joined by hyphens "
                         "- it becomes the folder, the id and the URL t/<name>/")
    if not re.match(r"^[a-z0-9][a-z0-9-]*$", group):
        raise SystemExit(f"subject folder {group!r} must be one lowercase folder name")
    subject = args.subject or SUBJECTS.get(group)
    if not subject:
        raise SystemExit(f"no default subject for {group}/ - pass --subject, "
                         'e.g. --subject "Economics HL"')
    title = args.title or name.replace("-", " ").capitalize()

    topics_path = root / "topics.json"
    text = topics_path.read_text(encoding="utf-8") if topics_path.exists() else "[]\n"
    topics = json.loads(text)
    if any(t.get("id") == name for t in topics):
        raise SystemExit(f"topics.json already has a topic with id {name!r}")
    folder = root / group / name
    if folder.exists():
        raise SystemExit(f"{folder.relative_to(root).as_posix()}/ already exists")

    stem = name.replace("-", "_")
    script, notebook = f"{stem}.py", f"{stem}.ipynb"
    source = script_text(title, subject, args.syllabus).replace("{name}", script)

    folder.mkdir(parents=True)
    try:
        (folder / script).write_text(source, encoding="utf-8", newline="\n")
        (folder / notebook).write_text(notebook_json(title, source), encoding="utf-8", newline="\n")
        (folder / "README.md").write_text(
            readme_text(title, subject, args.syllabus, script, notebook),
            encoding="utf-8", newline="\n")

        entry = {
            "id": name,
            "title": title,
            "subject": subject,
            "syllabus": args.syllabus,
            "folder": f"{group}/{name}",
            "script": script,
            "notebook": notebook,
            "tags": ["TODO: the questions a stuck student would type, not just the term"],
            "hard_bit": "TODO: what students can do mechanically but do not actually see.",
            "shows": "TODO: what the figure or animation makes visible.",
        }
        # The same check the build runs, before topics.json is touched, so a
        # scaffold that would break the site never gets as far as the file.
        build_site.validate(topics + [entry], root)
    except BaseException:
        shutil.rmtree(folder)
        raise

    topics_path.write_bytes(append_entry(text, entry).encode("utf-8"))

    rel = folder.relative_to(root).as_posix()
    print(f"created {rel}/ with {script}, {notebook} and README.md")
    print(f"added {name!r} to topics.json")
    print("next:")
    print(f"  1. fill in the TODOs in {rel}/ and in the topics.json entry (tags matter - "
          "they are how search finds it)")
    print("  2. run the notebook top to bottom so GitHub shows the graphs")
    print("  3. add a row to the Topics table in README.md")
    print("  4. python build_site.py")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except build_site.BuildError as e:
        sys.exit(f"new_topic.py: {e}")
