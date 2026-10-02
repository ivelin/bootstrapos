#!/usr/bin/env python3
"""Plain-language 'Where are we?' from company-state.json.

Uses company-state.schema.json when present (required fields + enums + ranges).
No third-party packages. Not a product runtime.

Usage:
  python3 company/state/where-are-we.py
  python3 company/state/where-are-we.py path/to/company-state.json
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

JOURNEY = {
    1: "Write the bet",
    2: "Write the bet",
    3: "Filter cheaply",
    4: "Ground it",
    5: "Build tiny slice",
    6: "Build tiny slice",
    7: "Try with real people",
    8: "Try with real people",
    9: "Try with real people",
}

# Stored 1–7 stay for back-compat. Not where-we-are. Quality bar only.
LOOP = {
    1: "Ask",
    2: "Ask",
    3: "Do",
    4: "Do",
    5: "Do",
    6: "Do",
    7: "Write back",
}

JOURNEY_PLAIN = {
    1: "You are still writing the bet: thesis, groups, and done-means. The business is not proved.",
    2: "You are still writing the bet: thesis, groups, and done-means. The business is not proved.",
    3: "You are filtering cheaply. That is a filter, not proof.",
    4: "You are grounding the idea with real people and small interest tests. Payment is still open.",
    5: "You are building a tiny slice and testing it hard. Stay on the slice.",
    6: "You are building a tiny slice and testing it hard. Stay on the slice.",
    7: "You are trying the slice with real people. Watch what they do, not only what they say.",
    8: "Stay at Try until founder Advance. Grow pack only if proof exists.",
    9: "Stay at Try until founder Advance. Grow pack only if proof exists.",
}

LOOP_PLAIN = {
    1: "Quality bar Ask — kill line + groups. Not a card. clock-examples is teaching only.",
    2: "Quality bar Ask — kill line + groups. Not a card. clock-examples is teaching only.",
    3: "Quality bar Do — one-page thesis (or this station’s artifact). Not a card. Do is not a synonym for Build.",
    4: "Quality bar Do — one-page thesis (or this station’s artifact). Not a card. Do is not a synonym for Build.",
    5: "Quality bar Do — one-page thesis (or this station’s artifact). Not a card. Do is not a synonym for Build.",
    6: "Quality bar Do — one-page thesis (or this station’s artifact). Not a card. Do is not a synonym for Build.",
    7: "Quality bar Write back — dated stated + what we will not do. Never invent this from stored 7.",
}

POSTURE_PLAIN = {
    "strict": "AI drafts and researches only. Send, spend, journey advance, public claims, and real-account changes wait for you.",
    "auto": "AI may run safe internal loops. High-stakes (send, spend, journey advance, public claims) still wait for you.",
    "dangerous": "Almost no pauses. Easy to hurt yourself. You still own the outcomes.",
}

GATE_PLAIN = {
    "open": "The next gate is open to consider. You still choose Advance / Iterate / Hold / Kill.",
    "waiting": "The next gate is waiting for you — a human call is due.",
    "blocked": "The next gate is blocked. Name the blocker in plain words before you push forward.",
}

EYES_PLAIN = {
    "unknown": "Unknown. Do not ask mentors or strangers to try a product link yet.",
    "blocked": "Blocked. Do not draft “please try this” until blockers are gone (or you write an override trace).",
    "green": "Green — a cold person can exercise the path. This is not demand or product–market fit.",
}


def die(msg: str, code: int = 2) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def find_state_path(arg: str | None) -> Path:
    if arg:
        path = Path(arg)
        if path.is_dir():
            path = path / "company-state.json"
        return path
    here = Path(__file__).resolve().parent
    candidates = [
        here / "company-state.json",
        Path.cwd() / "company" / "state" / "company-state.json",
        Path.cwd() / "company-state.json",
    ]
    for path in candidates:
        if path.is_file():
            return path
    die(
        "No company-state.json found. Pass a path, or run from the company repo root."
    )
    raise AssertionError("unreachable")


def load_json(path: Path) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        die(f"Missing file: {path}")
    except json.JSONDecodeError as err:
        die(f"Invalid JSON in {path}: {err}")
    raise AssertionError("unreachable")


def type_ok(value: object, declared: object) -> bool:
    names = declared if isinstance(declared, list) else [declared]
    for name in names:
        if name == "object" and isinstance(value, dict):
            return True
        if name == "array" and isinstance(value, list):
            return True
        if name == "string" and isinstance(value, str):
            return True
        if name == "integer" and isinstance(value, int) and not isinstance(value, bool):
            return True
        if name == "number" and isinstance(value, (int, float)) and not isinstance(value, bool):
            return True
        if name == "boolean" and isinstance(value, bool):
            return True
        if name == "null" and value is None:
            return True
    return False


def check_against_schema(data: object, schema: dict, path: str = "$") -> list[str]:
    """Tiny required / type / enum / min / max check. Not a full JSON Schema engine."""
    errors: list[str] = []
    declared = schema.get("type")
    if declared and not type_ok(data, declared):
        errors.append(f"{path}: expected type {declared}, got {type(data).__name__}")
        return errors
    if "enum" in schema and data not in schema["enum"]:
        errors.append(f"{path}: {data!r} not in {schema['enum']}")
    if isinstance(data, int) and not isinstance(data, bool):
        if "minimum" in schema and data < schema["minimum"]:
            errors.append(f"{path}: {data} < minimum {schema['minimum']}")
        if "maximum" in schema and data > schema["maximum"]:
            errors.append(f"{path}: {data} > maximum {schema['maximum']}")
    if isinstance(data, str) and "minLength" in schema and len(data) < schema["minLength"]:
        errors.append(f"{path}: string shorter than minLength {schema['minLength']}")
    if isinstance(data, dict):
        for key in schema.get("required", []):
            if key not in data:
                errors.append(f"{path}: missing required field {key!r}")
        props = schema.get("properties") or {}
        for key, subschema in props.items():
            if key in data:
                errors.extend(check_against_schema(data[key], subschema, f"{path}.{key}"))
    if isinstance(data, list) and "items" in schema:
        item_schema = schema["items"]
        for i, item in enumerate(data):
            errors.extend(check_against_schema(item, item_schema, f"{path}[{i}]"))
    return errors


def fmt(value: object) -> str:
    if value is None or value == "":
        return "(none)"
    return str(value)


def supporting_lines(raw: object) -> list[str]:
    if not isinstance(raw, list) or not raw:
        return ["  (none)"]
    lines: list[str] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        role = fmt(item.get("role"))
        st = fmt(item.get("state"))
        clock = fmt(item.get("clock") if item.get("clock") not in (None, "") else "—")
        nxt = fmt(item.get("nextAction") or item.get("next_action"))
        fact = fmt(item.get("lastObservedFact") or item.get("last_observed_fact"))
        lines.append(f"  {role} · {st} · clock {clock} · next {nxt} · last {fact}")
    return lines or ["  (none)"]


def engagement_lines(raw: object) -> list[str]:
    if not isinstance(raw, list) or not raw:
        return ["  (none)"]
    lines: list[str] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        account = fmt(item.get("account"))
        kind = fmt(item.get("kind"))
        st = fmt(item.get("state"))
        nda = " (NDA is not Try)" if str(item.get("kind") or "").lower() == "nda" else ""
        lines.append(f"  {account} · {kind} · {st}{nda}")
    return lines or ["  (none)"]


DATE_RE = re.compile(r"\b20\d{2}-\d{2}-\d{2}\b")


def _as_initiatives(state: dict) -> list[dict]:
    stored = state.get("initiatives")
    if isinstance(stored, list) and stored:
        return [item for item in stored if isinstance(item, dict)]
    rows: list[dict] = []
    constraint = state.get("constraintThisWeek") or state.get("constraint_this_week") or ""
    if isinstance(constraint, str) and constraint.strip():
        rows.append(
            {
                "id": "legacy-constraint",
                "kind": "customer_check",
                "premise": constraint.strip(),
                "status": "active",
                "last": "",
                "next": constraint.strip(),
            }
        )
    supporting = state.get("supporting") if isinstance(state.get("supporting"), list) else []
    role_kind = {
        "investor": "capital",
        "counsel": "legal",
        "advisor": "advisor",
        "contractor": "advisor",
        "partner": "advisor",
    }
    state_map = {"promise": "proposed", "clock": "waiting", "done": "closed", "dead": "closed"}
    for i, item in enumerate(supporting, 1):
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "advisor")
        st = str(item.get("state") or "promise")
        rows.append(
            {
                "id": f"legacy-supporting-{i}",
                "kind": role_kind.get(role, "advisor"),
                "premise": str(item.get("lastObservedFact") or item.get("last_observed_fact") or role),
                "status": state_map.get(st, "proposed"),
                "last": str(item.get("lastObservedFact") or item.get("last_observed_fact") or ""),
                "next": str(item.get("nextAction") or item.get("next_action") or ""),
                "clock": item.get("clock"),
            }
        )
    parent = next((r["id"] for r in rows if r.get("kind") == "customer_check"), None)
    engagements = state.get("engagements") if isinstance(state.get("engagements"), list) else []
    for i, item in enumerate(engagements, 1):
        if not isinstance(item, dict):
            continue
        row = {
            "id": f"legacy-engagement-{i}",
            "kind": "engagement",
            "premise": str(item.get("account") or ""),
            "status": state_map.get(str(item.get("state") or "promise"), "proposed"),
            "last": str(item.get("kind") or ""),
            "next": "",
        }
        if parent:
            row["parentId"] = parent
        rows.append(row)
    return rows


_PLAIN_SWAPS = (
    (re.compile(r"\bGC/PM\b", re.I), "people running building projects"),
    (re.compile(r"\bP0\b"), ""),
    (re.compile(r"\bFAST\b"), "the paperwork an advisor shares"),
    (re.compile(r"\bSOPA\b", re.I), "the paperwork to raise money"),
    (re.compile(r"\bSAFE\b"), "the paperwork to raise money"),
    (re.compile(r"\bengagements\b", re.I), "conversations"),
    (re.compile(r"\bengagement\b", re.I), "a conversation"),
    (re.compile(r"\bcustomer bets\b", re.I), "tries with buyers"),
    (re.compile(r"\bcustomer bet\b", re.I), "a try with buyers"),
    (re.compile(r"\bcustomer checks?\b", re.I), "a try with buyers"),
    (re.compile(r"\bNDAs?\b", re.I), "a confidentiality promise"),
    (re.compile(r"\bBottleneck #1\b", re.I), "the biggest problem"),
    (re.compile(r"\bforeign-entity filing\b", re.I), "registering to do business"),
    (re.compile(r"\baward portal\b", re.I), "the place that lists public jobs"),
)


def _plain(value: object) -> str:
    text = re.sub(r"\s+", " ", "" if value is None else str(value)).strip()
    text = re.sub(r"NDA is not Try", "", text, flags=re.I)
    for rule, repl in _PLAIN_SWAPS:
        text = rule.sub(repl, text)
    text = re.sub(r"\s+a confidentiality promise\b", ", a confidentiality promise", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def _gloss_people(text: str, seen: set[str]) -> str:
    def repl(match: re.Match[str]) -> str:
        email = match.group(0)
        key = email.lower()
        if key in seen:
            return email
        seen.add(key)
        rest = text[match.end() :]
        if re.match(r"\s*[A-Za-z]", rest):
            return f"{email}, the founder,"
        return f"{email}, the founder"

    return re.sub(r"\bfounder@example\.test\b", repl, text)


def _cell(value: str) -> str:
    text = value.replace("|", "/").strip()
    return text or "—"


def _dot(row: dict, bottleneck: bool) -> str:
    if str(row.get("outcome") or "") == "killed":
        return "🔴"
    if str(row.get("status") or "") == "closed":
        return "⚪"
    if bottleneck:
        return "🟢"
    if str(row.get("status") or "") == "waiting":
        return "🟡"
    if str(row.get("status") or "") == "active":
        return "🟢"
    return "⚪"


def _kind_mark(row: dict) -> str:
    kind = str(row.get("kind") or "")
    if kind == "capital":
        return "💵"
    if kind == "advisor":
        return "📄"
    if kind == "legal":
        return "⚖️"
    return _dot(row, False)


def _card_lines(state: dict) -> list[str]:
    rows = _as_initiatives(state)
    label = _plain(state.get("companyId")) or "company"
    if label.lower() == "default":
        label = "company"
    open_checks = [
        r
        for r in rows
        if r.get("kind") == "customer_check" and str(r.get("status") or "") != "closed"
    ]
    dated = [
        r
        for r in open_checks
        if DATE_RE.search(str(r.get("clock") or "") + " " + str(r.get("premise") or ""))
    ]
    bottleneck = (dated or open_checks or [None])[0]
    nested: dict[str, list[dict]] = {}
    footer: list[dict] = []
    for row in rows:
        if row.get("kind") == "engagement" and row.get("parentId"):
            nested.setdefault(str(row["parentId"]), []).append(row)
        elif row.get("kind") != "customer_check" or str(row.get("status") or "") == "closed":
            footer.append(row)
    fact = _plain(bottleneck.get("premise")) if bottleneck else ""
    if not fact or fact == "none yet":
        fact = "nothing is in play yet"
    fact = fact.rstrip(".")
    nxt = _plain(bottleneck.get("next")) if bottleneck else ""
    fix = f"To fix it, {nxt if nxt.endswith('.') else nxt + '.'}" if nxt else "To fix it, name who does the next step."
    seen: set[str] = set()
    fact = _gloss_people(fact, seen)
    fix = _gloss_people(fix, seen)
    possessive = f"{label}'" if label.lower().endswith("s") else f"{label}'s"
    lines = [
        f"**{possessive} biggest problem right now: {fact}.**",
        fix,
        "",
        "| What we're working on | Where it stands | What happens next | Who |",
        "|---|---|---|---|",
    ]

    def work_for(row: dict, bottleneck_row: bool, depth: int) -> str:
        premise = _plain(row.get("premise")) or "Untitled"
        kind = str(row.get("kind") or "")
        gloss = {
            "advisor": "an advisor",
            "legal": "a lawyer",
            "capital": "someone who might put money in",
            "engagement": "a company we're talking with",
        }.get(kind, "")
        key = premise.lower()
        words = premise.split()
        if (
            gloss
            and key not in seen
            and "," not in premise
            and 0 < len(words) <= 3
            and not re.search(r"\b(plant|shop|company|file|notes|tip|draft)\b", premise, re.I)
        ):
            seen.add(key)
            premise = f"{premise}, {gloss}"
        else:
            seen.add(key)
        if depth:
            return f"{'· · ' * depth}{premise}"
        icon = _kind_mark(row) if kind in ("capital", "legal", "advisor") else _dot(row, bottleneck_row)
        body = f"**{premise}**" if bottleneck_row else premise
        return f"{icon} {body}"

    def emit(row: dict, bottleneck_row: bool, depth: int) -> None:
        last = _plain(row.get("last")) or "Not started"
        if depth:
            dot = _dot(row, False)
            if not last.startswith(dot):
                last = f"{dot} {last}"
        nxt_cell = _plain(row.get("next")) or "—"
        if bottleneck_row:
            measure = _plain(row.get("measure"))
            if str(row.get("measure") or "").strip().lower() == "pay or use":
                measure = "someone pays or uses it"
            done = f"Done when {measure}" if measure else "Done when this is finished"
            nxt_cell = f"{done}. {nxt_cell}" if nxt_cell and nxt_cell != measure else done
        lines.append(
            f"| {_cell(_gloss_people(work_for(row, bottleneck_row, depth), seen))} | {_cell(_gloss_people(last, seen))} | {_cell(_gloss_people(nxt_cell, seen))} | — |"
        )

    rendered: set[str] = set()
    if bottleneck:
        emit(bottleneck, True, 0)
        rendered.add(str(bottleneck.get("id")))
        for child in nested.get(str(bottleneck.get("id")), []):
            emit(child, False, 1)
            rendered.add(str(child.get("id")))
    for check in open_checks:
        if str(check.get("id")) in rendered:
            continue
        emit(check, False, 0)
        rendered.add(str(check.get("id")))
        for child in nested.get(str(check.get("id")), []):
            emit(child, False, 1)
            rendered.add(str(child.get("id")))
    past = [r for r in footer if str(r.get("id")) not in rendered and r.get("kind") not in ("capital", "legal", "advisor")]
    background = [r for r in footer if str(r.get("id")) not in rendered and r.get("kind") in ("capital", "legal", "advisor")]
    for row in past:
        emit(row, False, 1 if row.get("parentId") else 0)
    for row in background:
        emit(row, False, 0)
    if len(lines) == 5:
        lines.append("| ⚪ Nothing on the board yet | Not started | Name what done looks like | — |")
    lines.extend(["", "*🟢 working on it now · 🟡 waiting · ⚪ stopped or not started · 🔴 killed*"])
    return lines


def snapshot(state: dict) -> str:
    phase = state.get("journeyPhase")
    stage = state.get("loopStage")
    gate = str(state.get("gateStatus") or "").lower()
    posture = str(state.get("autonomyPosture") or "").lower()
    eyes = state.get("readyForHumanEyes") or {}
    eyes_status = str(eyes.get("status") or "unknown").lower()
    scores = state.get("scores") or {}
    questions = state.get("openQuestions") or []
    snapshot_at = state.get("lastWeeklySnapshotAt")
    write_back_missing = not snapshot_at
    constraint = state.get("constraintThisWeek") or state.get("constraint_this_week") or ""

    lines = [
        *_card_lines(state),
        "",
        "WHERE ARE WE?  (plain language, under two minutes)",
        "",
        f"Company:     {fmt(state.get('companyId'))}",
        f"Hypothesis:  {fmt(state.get('hypothesis'))}",
        "             (hypothesis — subject to evidence)",
        "",
        f"JOURNEY (slow)     {JOURNEY.get(phase, '(unknown phase)')} ({fmt(phase)})",
        f"  {JOURNEY_PLAIN.get(phase, 'Say in one sentence how far you are on proving the business.')}",
        "",
        f"GATE               {fmt(state.get('gateStatus'))}",
        f"  {GATE_PLAIN.get(gate, 'Say whether the next gate is open, waiting for you, or blocked.')}",
        "",
        f"CONSTRAINT         {fmt(constraint) if constraint else 'none yet'}",
        "  Honest biggest bottleneck this week. Not a card. Not a fun side quest.",
        "",
        "MISSING ARTIFACTS",
        (
            "  Write back (no dated stated block + what we will not do)"
            if write_back_missing
            else "  none recorded"
        ),
        "  Ask / Do / Write back is a quality bar on the week's artifact, not a card.",
        "  Do not invent Write back from stored loopStage 7.",
        "",
        "PRIMARY (customer bet — rungs, gate, constraint, missing artifacts, kill line)",
        "",
        "SUPPORTING (same snapshot; no rungs; cannot promote)",
        *supporting_lines(state.get("supporting")),
        "",
        "ENGAGEMENTS (named accounts under primary; NDA is not Try)",
        *engagement_lines(state.get("engagements")),
        "",
        f"AUTONOMY           {fmt(state.get('autonomyPosture'))}",
        f"  {POSTURE_PLAIN.get(posture, 'Say how free the AI is this week (Strict / Auto / Dangerous).')}",
        "",
        f"READY FOR EYES     {fmt(eyes.get('status'))}",
        f"  {EYES_PLAIN.get(eyes_status, 'unknown / blocked / green — do not mix this with demand.')}",
        "",
        "SCORES (honest; engineering green is not product–market fit)",
    ]
    score_keys = [
        "problemEvidence",
        "willingnessToPay",
        "completion",
        "traceCompleteness",
    ]
    for key in score_keys:
        if key in scores:
            lines.append(f"  {key}: {fmt(scores.get(key))}")
    if scores.get("notes"):
        lines.append(f"  notes: {scores['notes']}")

    lines.extend(["", "OPEN QUESTIONS"])
    if questions:
        for i, q in enumerate(questions, 1):
            lines.append(f"  {i}. {q}")
    else:
        lines.append("  (none written)")

    snapshot_at = state.get("lastWeeklySnapshotAt")
    lines.extend(
        [
            "",
            f"LAST ACTION        {fmt(state.get('lastAction'))}",
            f"LAST SNAPSHOT      {fmt(snapshot_at) if snapshot_at else 'missing'}",
            "",
            "What this is not: proof of demand, payment, or product–market fit.",
            "Stamp a dated file under docs/company-os/instance/snapshots/ so next week has a baseline.",
        ]
    )
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    if argv and argv[0] in ("-h", "--help"):
        print(__doc__.strip())
        return 0
    state_path = find_state_path(argv[0] if argv else None)
    raw = load_json(state_path)
    if not isinstance(raw, dict):
        die(f"{state_path}: company-state.json must be a JSON object")

    schema_path = state_path.parent / "company-state.schema.json"
    if schema_path.is_file():
        schema = load_json(schema_path)
        if isinstance(schema, dict):
            errors = check_against_schema(raw, schema)
            if errors:
                print(f"Schema checks failed ({schema_path.name}):", file=sys.stderr)
                for err in errors:
                    print(f"  - {err}", file=sys.stderr)
                return 1

    sys.stdout.write(snapshot(raw))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
