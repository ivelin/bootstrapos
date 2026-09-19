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

LOOP = {
    1: "Ask",
    2: "Ask",
    3: "Make",
    4: "Check",
    5: "Check",
    6: "Hear",
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
    1: "This week’s loop is Ask — cheap research and first validation across several groups.",
    2: "This week’s loop is Ask — cheap research and first validation across several groups.",
    3: "This week’s loop is Make — building the smallest thing that can fail the written rules.",
    4: "This week’s loop is Check — testing and scoring against thresholds. Recommendation only, not auto-advance.",
    5: "This week’s loop is Check — testing and scoring against thresholds. Recommendation only, not auto-advance.",
    6: "This week’s loop is Hear — bringing real usage in (lawfully, redacted).",
    7: "This week’s loop is Write back. Never skip this write-back.",
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


def snapshot(state: dict) -> str:
    phase = state.get("journeyPhase")
    stage = state.get("loopStage")
    gate = str(state.get("gateStatus") or "").lower()
    posture = str(state.get("autonomyPosture") or "").lower()
    eyes = state.get("readyForHumanEyes") or {}
    eyes_status = str(eyes.get("status") or "unknown").lower()
    scores = state.get("scores") or {}
    questions = state.get("openQuestions") or []

    lines = [
        "WHERE ARE WE?  (plain language, under two minutes)",
        "",
        f"Company:     {fmt(state.get('companyId'))}",
        f"Hypothesis:  {fmt(state.get('hypothesis'))}",
        "             (hypothesis — subject to evidence)",
        "",
        f"JOURNEY (slow)     {JOURNEY.get(phase, '(unknown phase)')} ({fmt(phase)})",
        f"  {JOURNEY_PLAIN.get(phase, 'Say in one sentence how far you are on proving the business.')}",
        "",
        f"LIVE LOOP (fast)   {LOOP.get(stage, '(unknown stage)')} ({fmt(stage)})",
        f"  {LOOP_PLAIN.get(stage, 'Say in one sentence what the weekly loop is doing.')}",
        "",
        f"GATE               {fmt(state.get('gateStatus'))}",
        f"  {GATE_PLAIN.get(gate, 'Say whether the next gate is open, waiting for you, or blocked.')}",
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
