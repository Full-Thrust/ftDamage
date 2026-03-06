#!/usr/bin/env python3
import glob
import json
import sys
from pathlib import Path
from typing import Any, List, Tuple


ALLOWED_WEAPON_CLASSES = {"A", "B", "C"}
ALLOWED_ARCS = {"F", "P", "S", "A"}


def err(errors: List[str], path: str, message: str) -> None:
    errors.append(f"{path}: {message}")


def type_name(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    if value is None:
        return "null"
    return type(value).__name__


def expect_type(errors: List[str], path: str, value: Any, expected: str) -> bool:
    ok = False
    if expected == "string":
        ok = isinstance(value, str)
    elif expected == "number":
        ok = isinstance(value, (int, float)) and not isinstance(value, bool)
    elif expected == "integer":
        ok = isinstance(value, int) and not isinstance(value, bool)
    elif expected == "array":
        ok = isinstance(value, list)
    elif expected == "object":
        ok = isinstance(value, dict)
    if not ok:
        err(errors, path, f"expected {expected}, got {type_name(value)}")
    return ok


def validate_shipclass(doc: Any) -> List[str]:
    errors: List[str] = []
    if not expect_type(errors, "$", doc, "object"):
        return errors

    required = {"classKey", "name", "thrust", "damage", "firecons", "weapons"}
    optional = {"fighters"}
    allowed_top = required | optional

    for key in required:
        if key not in doc:
            err(errors, "$", f"missing required property '{key}'")

    for key in doc.keys():
        if key not in allowed_top:
            err(errors, f"$.{key}", "unexpected property")

    if "classKey" in doc:
        expect_type(errors, "$.classKey", doc["classKey"], "string")
    if "name" in doc:
        expect_type(errors, "$.name", doc["name"], "string")

    if "thrust" in doc and expect_type(errors, "$.thrust", doc["thrust"], "number"):
        if doc["thrust"] < 0:
            err(errors, "$.thrust", "must be >= 0")

    total_cells = None
    if "damage" in doc and expect_type(errors, "$.damage", doc["damage"], "object"):
        damage = doc["damage"]
        allowed_damage = {"total", "tracks"}
        for key in ["total", "tracks"]:
            if key not in damage:
                err(errors, "$.damage", f"missing required property '{key}'")
        for key in damage.keys():
            if key not in allowed_damage:
                err(errors, f"$.damage.{key}", "unexpected property")

        if "total" in damage and expect_type(errors, "$.damage.total", damage["total"], "integer"):
            if damage["total"] < 1:
                err(errors, "$.damage.total", "must be >= 1")
        if "tracks" in damage and expect_type(errors, "$.damage.tracks", damage["tracks"], "array"):
            tracks = damage["tracks"]
            if len(tracks) < 1:
                err(errors, "$.damage.tracks", "must have at least 1 row")
            cell_count = 0
            for i, row in enumerate(tracks):
                row_path = f"$.damage.tracks[{i}]"
                if not expect_type(errors, row_path, row, "array"):
                    continue
                if len(row) < 1:
                    err(errors, row_path, "must have at least 1 cell")
                for j, cell in enumerate(row):
                    cell_path = f"{row_path}[{j}]"
                    if not expect_type(errors, cell_path, cell, "integer"):
                        continue
                    if cell != 1:
                        err(errors, cell_path, "must be 1")
                    cell_count += 1
            total_cells = cell_count

    if "firecons" in doc and expect_type(errors, "$.firecons", doc["firecons"], "array"):
        for i, fc in enumerate(doc["firecons"]):
            fc_path = f"$.firecons[{i}]"
            if not expect_type(errors, fc_path, fc, "integer"):
                continue
            if fc != 1:
                err(errors, fc_path, "must be 1")

    if "weapons" in doc and expect_type(errors, "$.weapons", doc["weapons"], "array"):
        for i, weapon in enumerate(doc["weapons"]):
            wpath = f"$.weapons[{i}]"
            if not expect_type(errors, wpath, weapon, "object"):
                continue
            required_weapon = {"type", "class", "arcs"}
            for key in required_weapon:
                if key not in weapon:
                    err(errors, wpath, f"missing required property '{key}'")
            for key in weapon.keys():
                if key not in required_weapon:
                    err(errors, f"{wpath}.{key}", "unexpected property")

            if "type" in weapon and expect_type(errors, f"{wpath}.type", weapon["type"], "string"):
                if weapon["type"] != "BEAM":
                    err(errors, f"{wpath}.type", "must be 'BEAM'")

            if "class" in weapon and expect_type(errors, f"{wpath}.class", weapon["class"], "string"):
                if weapon["class"] not in ALLOWED_WEAPON_CLASSES:
                    err(errors, f"{wpath}.class", "must be one of A, B, C")

            if "arcs" in weapon and expect_type(errors, f"{wpath}.arcs", weapon["arcs"], "array"):
                if len(weapon["arcs"]) < 1:
                    err(errors, f"{wpath}.arcs", "must have at least one arc")
                for j, arc in enumerate(weapon["arcs"]):
                    apath = f"{wpath}.arcs[{j}]"
                    if not expect_type(errors, apath, arc, "string"):
                        continue
                    if arc not in ALLOWED_ARCS:
                        err(errors, apath, "must be one of F, P, S, A")

    if "fighters" in doc and expect_type(errors, "$.fighters", doc["fighters"], "object"):
        fighters = doc["fighters"]
        for key in ["capacity"]:
            if key not in fighters:
                err(errors, "$.fighters", f"missing required property '{key}'")
        for key in fighters.keys():
            if key != "capacity":
                err(errors, f"$.fighters.{key}", "unexpected property")
        if "capacity" in fighters and expect_type(errors, "$.fighters.capacity", fighters["capacity"], "integer"):
            if fighters["capacity"] < 1:
                err(errors, "$.fighters.capacity", "must be >= 1")

    if (
        total_cells is not None
        and "damage" in doc
        and isinstance(doc["damage"], dict)
        and isinstance(doc["damage"].get("total"), int)
        and doc["damage"]["total"] != total_cells
    ):
        err(
            errors,
            "$.damage.total",
            f"consistency warning: total is {doc['damage']['total']} but tracks contain {total_cells} cells",
        )

    return errors


def load_json(path: Path) -> Tuple[Any, List[str]]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as ex:
        return None, [f"$: unable to read file ({ex})"]
    try:
        return json.loads(text), []
    except json.JSONDecodeError as ex:
        return None, [f"$: invalid JSON ({ex.msg} at line {ex.lineno}, column {ex.colno})"]


def expand_inputs(args: List[str]) -> List[Path]:
    results: List[Path] = []
    for arg in args:
        matches = sorted(glob.glob(arg))
        if matches:
            results.extend(Path(m) for m in matches if Path(m).is_file())
            continue
        p = Path(arg)
        if p.is_file():
            results.append(p)
        elif p.is_dir():
            results.extend(sorted(p.glob("*.shipclass.json")))
    dedup = []
    seen = set()
    for p in results:
        key = str(p.resolve())
        if key not in seen:
            seen.add(key)
            dedup.append(p)
    return dedup


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: validate_shipclass.py <file-or-glob> [more files/globs]")
        print("Example: validate_shipclass.py generic/*.shipclass.json")
        return 2

    paths = expand_inputs(sys.argv[1:])
    if not paths:
        print("No files matched.")
        return 2

    failures = 0
    for path in paths:
        doc, load_errors = load_json(path)
        errors = load_errors if load_errors else validate_shipclass(doc)
        if errors:
            failures += 1
            print(f"[FAIL] {path}")
            for item in errors:
                print(f"  - {item}")
        else:
            print(f"[OK]   {path}")

    print(f"\nValidated {len(paths)} file(s); failures: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
