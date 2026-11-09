#!/usr/bin/env python3
"""Parse the IB HL catalogue PDFs into content/graph.json and questions/*.json.

Reads extracted text from /tmp/qbank/{math,physics,chemistry}.txt when present,
otherwise extracts from the PDF paths below with pypdf.

Run:  python3 scripts/import_qbank.py
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
TMP = Path("/tmp/qbank")

PDFS = {
    "math": Path("/Users/ian/Desktop/Homework/Capstone/IB_Math_AA_HL_Catalogue_and_1660_Questions.pdf"),
    "physics": Path("/Users/ian/Desktop/Homework/Capstone/IB_Physics_HL_Catalogue_and_480_Questions.pdf"),
    "chemistry": Path("/Users/ian/Desktop/Homework/Capstone/IB_Chemistry_HL_Catalogue_and_440_Questions.pdf"),
}

TITLE_FIXES = (
    ("F orces", "Forces"),
    ("W ork", "Work"),
    ("W ave", "Wave"),
    ("F rom", "From"),
    ("F unctional", "Functional"),
    ("F usion", "Fusion"),
    ("F urther", "Further"),
    ("T rigonometric", "Trigonometric"),
    ("T aylor", "Taylor"),
    ("A verage", "Average"),
)

# Hand-authored lessons / questions → new catalogue node ids.
LEGACY_NODE_MAP = {
    "m-limits": "m-5-1",
    "m-maclaurin": "m-5-19",
    "p-projectile": "p-a-1",
    "p-shm": "p-c-1",
    "p-decay": "p-e-3",
    "c-boltzmann": "c-r2-2",
    "c-orbitals": "c-s1-3",
}

MATH_UNIT_CLUSTER = {"1": "num", "2": "fun", "3": "geo", "4": "sta", "5": "cal"}


def load_text(subject: str) -> str:
    cached = TMP / f"{subject}.txt"
    if cached.exists():
        return cached.read_text(encoding="utf-8")
    from pypdf import PdfReader

    reader = PdfReader(str(PDFS[subject]))
    parts = []
    for i, page in enumerate(reader.pages):
        parts.append(f"\n\n===== PAGE {i + 1} =====\n{page.extract_text() or ''}")
    text = "".join(parts)
    TMP.mkdir(parents=True, exist_ok=True)
    cached.write_text(text, encoding="utf-8")
    return text


def fix_title(title: str) -> str:
    t = title.strip()
    for a, b in TITLE_FIXES:
        t = t.replace(a, b)
    return re.sub(r"\s+", " ", t).strip()


def clean_prompt(text: str) -> str:
    t = text.strip()
    t = re.sub(r"\n+", " ", t)
    t = re.sub(r"\s+", " ", t)
    # Number glued to a following word: 0.00072in → 0.00072 in
    t = re.sub(r"(\d)([A-Za-z])", r"\1 \2", t)
    # SI unit letter glued to a direction / preposition (PDF artifact).
    t = re.sub(
        r"\b([mun]|ms|m s)(east|west|north|south|to|from)\b",
        r"\1 \2",
        t,
        flags=re.I,
    )
    t = re.sub(r"(\d(?:\.\d+)?\s*m)in\b", r"\1 in", t)  # 16.0 min → 16.0 m in
    t = re.sub(r"(\d(?:\.\d+)?\s*m)to\b", r"\1 to", t)
    # Formula glued to "in a/the": NaClin a → NaCl in a
    t = re.sub(r"([A-Za-z0-9\)])in\s+(a|an|the)\b", r"\1 in \2", t)
    # Unit glued to "of": 5.585 gof → 5.585 g of
    t = re.sub(r"\b(g|kg|mg|mol|cm3|dm3|kJ|J)of\b", r"\1 of", t)
    for a, b in TITLE_FIXES:
        t = t.replace(a, b)
    return t.strip()


def strip_page_noise(text: str) -> str:
    # Drop page banners inserted during extraction.
    text = re.sub(r"\n===== PAGE \d+ =====\n", "\n", text)
    text = re.sub(
        r"\d[\d,]* original questions \|[^\n]*\n?",
        "\n",
        text,
        flags=re.I,
    )
    text = re.sub(r"(?m)^(CHEMISTRY|PHYSICS|MATHEMATICS) HL (Questions|Solutions).*$", "", text)
    text = re.sub(r"(?m)^Easy / 01-06\s*$", "", text)
    text = re.sub(r"(?m)^Medium / 07-14\s*$", "", text)
    text = re.sub(r"(?m)^Hard / 15-20\s*$", "", text)
    return text


def difficulty_from_num(n: int) -> int:
    if n <= 6:
        return 1
    if n <= 14:
        return 2
    return 3


def minutes_from_diff(d: int) -> int:
    return {1: 2, 2: 3, 3: 5}[d]


def level_from_label(label: str) -> str:
    label = label.lower()
    if "hl only" in label or label.strip() == "ahl":
        return "AHL"
    if label.strip() == "sl":
        return "SL"
    # Shared / Shared + HL / Shared + AHL → treat as SL core with HL tags elsewhere
    return "SL"


def node_id_math(code: str) -> str:
    a, b = code.split(".")
    return f"m-{a}-{b}"


def node_id_phys(code: str) -> str:
    letter, num = code.split(".")
    return f"p-{letter.lower()}-{num}"


def node_id_chem(code: str) -> str:
    # S1.1 → c-s1-1 ; R2.3 → c-r2-3
    m = re.match(r"([SR])(\d)\.(\d+)", code, re.I)
    if not m:
        raise ValueError(code)
    return f"c-{m.group(1).lower()}{m.group(2)}-{m.group(3)}"


def first_sentence(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return "Use the definitions and methods from this topic."
    m = re.search(r"(.+?[.!?])(\s|$)", text)
    s = m.group(1).strip() if m else text
    if len(s) > 220:
        s = s[:217].rstrip() + "…"
    return s


def parse_numeric_answer(ans: str):
    """Return (value, units, tol) or None if not a plain numeric answer."""
    s = ans.strip()
    s = s.replace("−", "-").replace("–", "-").replace(",", "")
    # Strip trailing MC letter decorations like "B: 50.0 m east"
    if re.match(r"^[A-D]\s*:", s, re.I):
        return None
    # Pure scientific notation kept as short (exact form).
    if re.search(r"10\s*[−\-]?\s*\d|×\s*10|x\s*10", s, re.I):
        return None
    # Number optionally with units; reject if lots of letters that aren't unit-like.
    m = re.match(
        r"^([+-]?(?:\d+\.?\d*|\.\d+)(?:\s*[eE]\s*[+-]?\d+)?)\s*(.*)$",
        s,
    )
    if not m:
        return None
    value = float(m.group(1).replace(" ", ""))
    units = m.group(2).strip()
    # Reject multi-word conceptual answers mistaken for units.
    if units and re.search(r"\b(and|or|the|of|is|are|which|when)\b", units, re.I):
        return None
    if len(units) > 24:
        return None
    # Relative tolerance suited to 3 s.f. answers.
    tol = 0.005 if value != 0 else None
    abs_tol = 0.01 if value == 0 else None
    out = {"value": value}
    if tol is not None:
        out["tol"] = tol
    else:
        out["abs"] = abs_tol
    if units:
        # Keep compact unit tokens; drop trailing prose after first clause.
        units = re.split(r"\s{2,}|;", units)[0].strip()
        out["units"] = units
    return out


def short_accepts(text: str) -> list[str]:
    accepts = []
    t = text.strip()
    # (aq) ↔ aq
    if t.startswith("(") and t.endswith(")"):
        accepts.append(t[1:-1])
    elif re.fullmatch(r"[a-zA-Z]{1,4}", t):
        accepts.append(f"({t})")
    # × / x / * between powers of ten
    if "×" in t:
        accepts.append(t.replace("×", "x"))
        accepts.append(t.replace("×", "*"))
    if "−" in t:
        accepts.append(t.replace("−", "-"))
    return list(dict.fromkeys(a for a in accepts if a and a != t))


def split_mc_choices(body: str) -> list[dict] | None:
    # Prefer lettered choices A. … B. …
    parts = re.split(r"(?=(?:^|\s)([A-D])\.\s)", body)
    # Manual scan
    matches = list(re.finditer(r"(?:^|\s)([A-D])\.\s+", body))
    if len(matches) < 2:
        return None
    choices = []
    for i, m in enumerate(matches):
        letter = m.group(1)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        text = clean_prompt(body[start:end])
        text = re.sub(r"\s*Solution p\.\s*\d+\s*$", "", text, flags=re.I).strip()
        if text:
            choices.append({"letter": letter, "text": text})
    return choices if len(choices) >= 2 else None


# Cut question bodies before solutions sections / solution headers leak in.
_SOLUTION_CUT = re.compile(
    r"(?:"
    r"\b[A-Z0-9.]+ solutions\s*\|"
    r"|\b(?:CHEMISTRY|PHYSICS|MATHEMATICS) HL Solutions\b"
    r"|Q[A-Z0-9.]+\.\d{2}\s+(?:Easy|Medium|Hard)\s*\|"
    r")",
    re.I,
)


def trim_question_body(body: str) -> str:
    m = _SOLUTION_CUT.search(body)
    if m:
        body = body[: m.start()]
    return body.strip()


def parse_blocks(text: str, header_re: re.Pattern, *, trim_solutions: bool = False) -> list[dict]:
    """Split text into question/solution blocks using a header regex with named groups."""
    text = strip_page_noise(text)
    matches = list(header_re.finditer(text))
    blocks = []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[m.end() : end].strip()
        if trim_solutions:
            body = trim_question_body(body)
        info = m.groupdict()
        info["body"] = body
        info["raw"] = m.group(0)
        blocks.append(info)
    return blocks


def parse_math_catalogue(text: str) -> list[dict]:
    rows = re.findall(
        r"(?m)^(\d+\.\d+)\s*\n(SL|AHL)\s*\n([^\n]+)",
        text,
    )
    out = []
    for code, level, title in rows:
        unit = code.split(".")[0]
        out.append(
            {
                "code": code,
                "level_label": level,
                "title": fix_title(title),
                "node_id": node_id_math(code),
                "subject": "math",
                "cluster": MATH_UNIT_CLUSTER[unit],
                "syllabus": code,
            }
        )
    return out


def parse_phys_catalogue(text: str) -> list[dict]:
    rows = re.findall(
        r"(?m)^([A-E]\.\d+)\s*\n(Shared(?: \+ AHL)?|HL only)\s*\n([^\n]+)",
        text,
    )
    out = []
    for code, level, title in rows:
        out.append(
            {
                "code": code,
                "level_label": level,
                "title": fix_title(title),
                "node_id": node_id_phys(code),
                "subject": "physics",
                "cluster": code.split(".")[0],
                "syllabus": code,
            }
        )
    return out


def parse_chem_catalogue(text: str) -> list[dict]:
    rows = re.findall(
        r"(?m)^(S\d\.\d+|R\d\.\d+)\s*\n(Shared(?: \+ HL)?|HL only)\s*\n([^\n]+)",
        text,
    )
    out = []
    for code, level, title in rows:
        cluster = re.match(r"[SR]\d", code, re.I).group(0)
        out.append(
            {
                "code": code,
                "level_label": level,
                "title": fix_title(title),
                "node_id": node_id_chem(code),
                "subject": "chemistry",
                "cluster": cluster,
                "syllabus": code,
            }
        )
    return out


def enrich_summaries(topics: list[dict], text: str):
    """Pull the multi-line learning-focus blurb under each catalogue title when present."""
    for t in topics:
        # After the title line, prose until "Questions p." 
        pat = (
            re.escape(t["code"])
            + r"\s*\n"
            + re.escape(t["level_label"])
            + r"\s*\n"
            + re.escape(t["title"].split(":")[0][:20]).replace(r"\ ", r"\s+")
        )
        # Simpler: find "Questions p." blocks near the code
        m = re.search(
            rf"(?s){re.escape(t['code'])}\s*\n{re.escape(t['level_label'])}\s*\n(.+?)Questions p\.",
            text,
        )
        if not m:
            t["summary"] = t["title"] + "."
            t["tags"] = []
            continue
        blurb = clean_prompt(m.group(1))
        # Drop the title itself if repeated at start.
        if blurb.lower().startswith(t["title"].lower()[:12].lower()):
            # remove first sentence-ish
            blurb = re.sub(r"^[^.]+\.\s*", "", blurb, count=1) or blurb
        if len(blurb) > 320:
            blurb = blurb[:317].rstrip() + "…"
        t["summary"] = blurb or (t["title"] + ".")
        words = re.findall(r"[A-Za-z][A-Za-z\-]{3,}", t["title"])
        t["tags"] = [w.lower() for w in words[:6]]


def build_graph(topics: list[dict]) -> dict:
    subjects = [
        {
            "id": "math",
            "name": "Math AA HL",
            "short": "Math",
            "clusters": [
                {"id": "num", "name": "Number"},
                {"id": "fun", "name": "Functions"},
                {"id": "geo", "name": "Geometry"},
                {"id": "sta", "name": "Statistics"},
                {"id": "cal", "name": "Calculus"},
            ],
        },
        {
            "id": "physics",
            "name": "Physics HL",
            "short": "Physics",
            "clusters": [
                {"id": "A", "name": "Motion"},
                {"id": "B", "name": "Matter"},
                {"id": "C", "name": "Waves"},
                {"id": "D", "name": "Fields"},
                {"id": "E", "name": "Nuclear"},
            ],
        },
        {
            "id": "chemistry",
            "name": "Chemistry HL",
            "short": "Chemistry",
            "clusters": [
                {"id": "S1", "name": "Models"},
                {"id": "S2", "name": "Bonding"},
                {"id": "S3", "name": "Matter"},
                {"id": "R1", "name": "Energy"},
                {"id": "R2", "name": "Rates"},
                {"id": "R3", "name": "Mechanisms"},
            ],
        },
    ]
    # Topic mastery ratings from content/difficulty.json (1–4 catalogue levels).
    diff_path = CONTENT / "difficulty.json"
    topic_diff = json.loads(diff_path.read_text(encoding="utf-8")) if diff_path.exists() else {}

    nodes = []
    for t in topics:
        level = level_from_label(t["level_label"])
        spec = "current"
        nodes.append(
            {
                "id": t["node_id"],
                "subject": t["subject"],
                "cluster": t["cluster"],
                "title": t["title"],
                "syllabus": t["syllabus"],
                "level": level,
                "difficulty": int(topic_diff.get(t["syllabus"], 2)),
                "spec": spec,
                "summary": t.get("summary") or (t["title"] + "."),
                "tags": t.get("tags") or [],
            }
        )

    # Sequential prerequisite edges within each cluster.
    edges = []
    by_cluster: dict[tuple[str, str], list[dict]] = {}
    for n in nodes:
        by_cluster.setdefault((n["subject"], n["cluster"]), []).append(n)
    for (_subj, _cl), group in by_cluster.items():
        # Sort by syllabus code naturally
        group.sort(key=lambda n: [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", n["syllabus"])])
        for a, b in zip(group, group[1:]):
            edges.append({"from": a["id"], "to": b["id"], "type": "prerequisite"})

    # A few useful cross-links (same-subject similarity / application).
    extra = [
        ("m-5-1", "m-5-12", "similarity", "Both develop differentiation from first principles."),
        ("m-5-13", "m-5-19", "application", "Series expansions resolve 0/0 limits."),
        ("p-a-1", "p-c-1", "application", "SHM uses kinematics of oscillating displacement."),
        ("p-e-3", "p-e-4", "prerequisite"),
        ("c-s1-3", "c-s3-1", "application", "Periodic trends follow from electron configurations."),
        ("c-r2-2", "c-r2-3", "prerequisite"),
    ]
    ids = {n["id"] for n in nodes}
    for row in extra:
        frm, to, typ = row[0], row[1], row[2]
        if frm in ids and to in ids:
            e = {"from": frm, "to": to, "type": typ}
            if len(row) > 3:
                e["note"] = row[3]
            # Avoid duplicate undirected pairs
            if not any({e["from"], e["to"]} == {x["from"], x["to"]} for x in edges):
                edges.append(e)

    return {
        "specs": {
            "math": {"label": "Math AA HL", "first_assessment": 2021},
            "physics": {"label": "Physics HL", "first_assessment": 2025},
            "chemistry": {"label": "Chemistry HL", "first_assessment": 2025},
        },
        "subjects": subjects,
        "nodes": nodes,
        "edges": edges,
    }


def parse_solution_map(text: str, header_re: re.Pattern) -> dict[tuple[str, str], dict]:
    blocks = parse_blocks(text, header_re)
    out = {}
    for b in blocks:
        code, num = b["code"], b["num"]
        body = b["body"]
        # Answer line
        am = re.search(r"Answer:\s*(.+?)(?:\n|$)", body)
        answer = clean_prompt(am.group(1)) if am else ""
        reason = body
        if am:
            reason = body[am.end() :].strip()
        reason = clean_prompt(reason)
        # Split into solution steps by sentences (keep compact).
        steps = []
        if reason:
            parts = re.split(r"(?<=[.!?])\s+", reason)
            steps = [p.strip() for p in parts if p.strip()][:6]
        if not steps:
            steps = [f"The answer is {answer}."] if answer else ["See the worked solution in the source book."]
        out[(code, num)] = {
            "answer": answer,
            "solution": steps,
            "hint": first_sentence(reason) if reason else f"Aim for the answer {answer}." if answer else "Review the key idea for this topic.",
            "title": clean_prompt(b.get("title") or ""),
            "level_tag": b.get("tag") or "",
        }
    return out


def classify_and_build_question(
    *,
    qid: str,
    node_id: str,
    code: str,
    num: str,
    prompt: str,
    kind: str,
    sol: dict | None,
    choices: list[dict] | None,
) -> dict | None:
    n = int(num)
    diff = difficulty_from_num(n)
    prompt = clean_prompt(prompt)
    prompt = re.sub(r"\s*Solution p\.\s*\d+\s*$", "", prompt, flags=re.I).strip()
    if not prompt:
        return None

    sol = sol or {
        "answer": "",
        "solution": ["Work carefully from the definitions in this topic."],
        "hint": "Identify what the question is asking for before computing.",
    }

    base = {
        "id": qid,
        "node": node_id,
        "difficulty": diff,
        "minutes": minutes_from_diff(diff),
        "prompt": prompt,
        "hints": [sol["hint"]],
        "solution": sol["solution"],
        "misconceptions": [],
    }

    if kind == "mc" or (choices and len(choices) >= 2):
        if not choices or len(choices) < 2:
            return None
        ans = (sol.get("answer") or "").strip()
        letter = None
        m = re.match(r"^([A-D])\b", ans, re.I)
        if m:
            letter = m.group(1).upper()
        built = []
        for c in choices:
            item = {"text": c["text"]}
            if letter and c["letter"].upper() == letter:
                item["correct"] = True
            else:
                item["why"] = "Not the best match for the stem; compare with the correct option."
            built.append(item)
        if not any(c.get("correct") for c in built):
            # Fallback: mark first choice correct only if answer empty — skip instead.
            if letter:
                # Letter not found among choices
                return None
            return None
        # Ensure wrong choices have why
        for c in built:
            if not c.get("correct"):
                c.setdefault("why", "Does not satisfy the conditions in the stem.")
        base.update({"format": "mcq", "skill": "concept", "choices": built})
        return base

    answer_text = (sol.get("answer") or "").strip()
    if not answer_text:
        # Still import as short with unknown answer from prompt? Skip — ungradable.
        return None

    # Strip leading "A:" style from non-mc solutions that reuse letter form.
    numeric = parse_numeric_answer(answer_text)
    if numeric and kind != "force_short":
        base.update(
            {
                "format": "numeric",
                "skill": "calculation",
                "answer": numeric,
            }
        )
        return base

    base.update(
        {
            "format": "short",
            "skill": "calculation" if re.search(r"\d", answer_text) else "concept",
            "answer": {"text": answer_text, "accept": short_accepts(answer_text)},
        }
    )
    return base


def import_math(text: str, topics: list[dict]) -> list[dict]:
    by_code = {t["code"]: t for t in topics}
    # Solutions appear in the Solutions half; questions in Questions half.
    # Split roughly on first "solutions |" page banner for unit 1.
    sol_re = re.compile(
        r"Q(?P<code>\d+\.\d+)\.(?P<num>\d{2})\s+(?P<diff>Easy|Medium|Hard)\s*\|\s*(?P<title>[^\n]+)",
    )
    q_re = re.compile(
        r"Q(?P<code>\d+\.\d+)\.(?P<num>\d{2})\s+(?P<mode>NC|GDC)\s+Solution p\.\s*\d+",
    )
    sols = parse_solution_map(text, sol_re)
    q_blocks = parse_blocks(text, q_re, trim_solutions=True)
    questions = []
    seen = set()
    for b in q_blocks:
        code, num = b["code"], b["num"]
        key = (code, num)
        if key in seen:
            continue
        seen.add(key)
        topic = by_code.get(code)
        if not topic:
            continue
        body = b["body"]
        # Prompt is body until next Q of same pattern already split; trim section headers.
        prompt = body
        # Math questions are almost never MC in this book.
        q = classify_and_build_question(
            qid=f"{topic['node_id']}-{num}",
            node_id=topic["node_id"],
            code=code,
            num=num,
            prompt=prompt,
            kind="short",
            sol=sols.get(key),
            choices=None,
        )
        if q:
            questions.append(q)
    return questions


def import_science(text: str, topics: list[dict], subject: str) -> list[dict]:
    by_code = {t["code"]: t for t in topics}
    if subject == "physics":
        q_re = re.compile(
            r"Q(?P<code>[A-E]\.\d+)\.(?P<num>\d{2})\s+(?P<tag>Shared|AHL)\s*\|\s*(?P<kind>MC|Short answer)\s+Solution p\.\s*\d+",
        )
        sol_re = re.compile(
            r"Q(?P<code>[A-E]\.\d+)\.(?P<num>\d{2})\s+(?P<diff>Easy|Medium|Hard)\s*\|\s*(?P<tag>Shared|AHL)\s*\|\s*(?P<title>[^\n]+)",
        )
    else:
        q_re = re.compile(
            r"Q(?P<code>S\d\.\d+|R\d\.\d+)\.(?P<num>\d{2})\s+(?P<tag>Shared|HL)\s*\|\s*(?P<kind>MC|Short answer)\s+Solution p\.\s*\d+",
        )
        sol_re = re.compile(
            r"Q(?P<code>S\d\.\d+|R\d\.\d+)\.(?P<num>\d{2})\s+(?P<diff>Easy|Medium|Hard)\s*\|\s*(?P<tag>Shared|HL)\s*\|\s*(?P<title>[^\n]+)",
        )

    sols = parse_solution_map(text, sol_re)
    q_blocks = parse_blocks(text, q_re, trim_solutions=True)
    questions = []
    seen = set()
    for b in q_blocks:
        code, num = b["code"], b["num"]
        key = (code, num)
        if key in seen:
            continue
        seen.add(key)
        topic = by_code.get(code)
        if not topic:
            continue
        kind = (b.get("kind") or "").lower()
        body = b["body"]
        choices = split_mc_choices(body) if kind == "mc" else None
        prompt = body
        if choices:
            # Prompt is text before first choice.
            m = re.search(r"(?:^|\s)([A-D])\.\s+", body)
            if m:
                prompt = body[: m.start()]
        q = classify_and_build_question(
            qid=f"{topic['node_id']}-{num}",
            node_id=topic["node_id"],
            code=code,
            num=num,
            prompt=prompt,
            kind="mc" if kind == "mc" else "short",
            sol=sols.get(key),
            choices=choices,
        )
        if q:
            questions.append(q)
    return questions


def remap_legacy_questions() -> dict[str, list[dict]]:
    """Load existing hand-authored questions and remapa node ids."""
    out = {"math": [], "physics": [], "chemistry": []}
    for subject in out:
        path = CONTENT / "questions" / f"{subject}.json"
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        # Only keep legacy curated items whose ids don't look like catalogue imports.
        for q in data:
            node = q.get("node")
            if node not in LEGACY_NODE_MAP:
                continue
            q = dict(q)
            q["node"] = LEGACY_NODE_MAP[node]
            # Avoid colliding with imported m-5-1-01 style ids.
            if re.fullmatch(r"[mpc]-[a-z0-9]+-\d{2}", q["id"]) or q["id"].count("-") <= 2:
                q["id"] = "legacy-" + q["id"]
            out[subject].append(q)
    return out


def migrate_lessons():
    lessons_dir = CONTENT / "lessons"
    for old, new in LEGACY_NODE_MAP.items():
        src = lessons_dir / f"{old}.json"
        dst = lessons_dir / f"{new}.json"
        if not src.exists():
            continue
        lesson = json.loads(src.read_text(encoding="utf-8"))
        lesson["node"] = new
        dst.write_text(json.dumps(lesson, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        if src.resolve() != dst.resolve():
            src.unlink()
        print(f"migrated lesson {old} → {new}")


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)")


def main():
    # Snapshot legacy questions before overwrite.
    legacy = remap_legacy_questions()

    math_text = load_text("math")
    phys_text = load_text("physics")
    chem_text = load_text("chemistry")

    math_topics = parse_math_catalogue(math_text)
    phys_topics = parse_phys_catalogue(phys_text)
    chem_topics = parse_chem_catalogue(chem_text)
    enrich_summaries(math_topics, math_text)
    enrich_summaries(phys_topics, phys_text)
    enrich_summaries(chem_topics, chem_text)

    print(
        f"catalogue: math={len(math_topics)} physics={len(phys_topics)} chemistry={len(chem_topics)}"
    )

    graph = build_graph(math_topics + phys_topics + chem_topics)
    write_json(CONTENT / "graph.json", graph)

    math_q = import_math(math_text, math_topics)
    phys_q = import_science(phys_text, phys_topics, "physics")
    chem_q = import_science(chem_text, chem_topics, "chemistry")

    # Append remapped legacy items (skip if id already present).
    for subject, imported, extra in (
        ("math", math_q, legacy["math"]),
        ("physics", phys_q, legacy["physics"]),
        ("chemistry", chem_q, legacy["chemistry"]),
    ):
        have = {q["id"] for q in imported}
        for q in extra:
            if q["id"] not in have:
                imported.append(q)
        write_json(CONTENT / "questions" / f"{subject}.json", imported)
        print(f"  {subject}: {len(imported)} questions")

    migrate_lessons()
    print("done. Next: python3 build_site.py")


if __name__ == "__main__":
    main()
