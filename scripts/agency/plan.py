#!/usr/bin/env python3
"""Read-only planning consistency and phase selection; not application validation."""

import argparse
import csv
import datetime
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs/agency"
STATUSES = {"planned", "in_progress", "blocked", "complete"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def document(relative):
    require(isinstance(relative, str) and bool(relative.strip()), "Missing document path")
    path = (ROOT / relative).resolve()
    require(path.is_relative_to(ROOT), f"Path outside repository: {relative}")
    require(path.is_file(), f"Missing document: {relative}")
    return path


def validate():
    state = json.loads((DOCS / "project-state.json").read_text())
    require(state["schema_version"] == 1, "Unsupported state schema")
    datetime.date.fromisoformat(state["updated_at"])
    require(state["setup"]["status"] == "complete", "Planning foundation incomplete")
    document(state["setup"]["report"])
    lock = json.loads((DOCS / "upstream.lock.json").read_text())
    require(bool(re.fullmatch(r"[0-9a-f]{40}", lock["commit"])), "Invalid upstream commit")
    require(lock["update_policy"] == "manual-review-only", "Unexpected update policy")
    phases = state["phases"]
    require([p["id"] for p in phases] == list(range(7)), "Expected ordered V1 phases 0–6")
    require(sum(p["status"] in {"in_progress", "blocked"} for p in phases) <= 1,
            "More than one active/blocked phase")
    spec_text = (DOCS / "PRODUCT-SPEC.md").read_text()
    spec_ids = set(re.findall(r"\| (V1-[A-Z]+-\d{3}) \|", spec_text))
    test_text = (DOCS / "TEST-STRATEGY.md").read_text()
    test_ids = set(re.findall(r"\| (T\d{2}-\d{2}) \|", test_text))
    phase_requirements = set()
    phase_cases = set()
    for p in phases:
        label = f"Phase {p['id']}"
        require(p["status"] in STATUSES, f"{label}: invalid status")
        expected_deps = [] if p["id"] == 0 else [p["id"] - 1]
        require(p["depends_on"] == expected_deps, f"{label}: dependency order changed")
        document(p["spec"])
        require(p["requirements"] and set(p["requirements"]) <= spec_ids,
                f"{label}: unknown/missing requirements")
        require(p["acceptance"] and set(p["acceptance"]) <= test_ids,
                f"{label}: unknown/missing acceptance cases")
        phase_requirements.update(p["requirements"])
        phase_cases.update(p["acceptance"])
        require(isinstance(p["blockers"], list), f"{label}: blockers must be a list")
        require(isinstance(p["checks"], list), f"{label}: checks must be a list")
        if p["status"] != "planned":
            require(all(phases[n]["status"] == "complete" for n in p["depends_on"]),
                    f"{label}: prerequisite is not complete")
            document(p["report"])
        if p["status"] == "blocked":
            require(p["blockers"] and all(isinstance(b, str) and b.strip() for b in p["blockers"]),
                    f"{label}: explain the blocker")
        if p["status"] == "complete":
            require(not p["blockers"], f"{label}: completed with blockers")
            checks = p["checks"]
            ids = [c["id"] for c in checks]
            require(len(ids) == len(set(ids)), f"{label}: duplicate check IDs")
            require(set(p["acceptance"]) <= set(ids), f"{label}: missing gate evidence")
            for c in checks:
                require(c["result"] == "passed", f"{label}: a required check did not pass")
                require(isinstance(c["command"], str) and bool(c["command"].strip()),
                        f"{label}: missing executed command")
                document(c["evidence"])
    require(phase_requirements == spec_ids, "Some V1 requirements have no phase")
    require(phase_cases == test_ids, "Some acceptance cases have no phase")
    with (DOCS / "traceability.csv").open(newline="") as f:
        rows = list(csv.DictReader(f))
    require(len(rows) == len(spec_ids) and {r["requirement_id"] for r in rows} == spec_ids,
            "Traceability has missing, duplicate or unknown requirements")
    for row in rows:
        p = phases[int(row["owning_phase"])]
        require(row["requirement_id"] in p["requirements"], "Traceability phase mismatch")
        require(set(row["acceptance_cases"].split(";")) <= set(p["acceptance"]),
                "Traceability acceptance mismatch")
        if p["status"] == "complete":
            for key in ["implementation", "test_files", "evidence"]:
                require(row[key].strip() not in {"", "not implemented", "not run"},
                        f"Completed requirement {row['requirement_id']} has no {key}")
    # Check local document links in our authored plan, excluding verbatim research/archive.
    for path in DOCS.rglob("*.md"):
        if any(part in {"archive", "research"} for part in path.relative_to(DOCS).parts):
            continue
        for link in re.findall(r"\]\(([^)]+)\)", path.read_text()):
            if re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:", link) or link.startswith("#"):
                continue
            target = unquote(link.split("#", 1)[0])
            require((path.parent / target).exists(), f"Broken link in {path.name}: {link}")
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "next", "phase"])
    parser.add_argument("number", nargs="?", type=int)
    args = parser.parse_args()
    try:
        state = validate()
        phases = state["phases"]
        pending = next((p for p in phases if p["status"] != "complete"), None)
        if args.command == "check":
            require(args.number is None, "check takes no phase number")
            print(f"PASS: planning documents, {len(phases)} phases, traceability and state are consistent.")
            print("Application behavior and test evidence have NOT been executed or certified by this command.")
        elif args.command == "next":
            require(args.number is None, "next takes no phase number")
            if pending:
                print(f"Next: phase {pending['id']} — {pending['title']} [{pending['status']}]")
                print(f"Read: {pending['spec']}")
                for blocker in pending["blockers"]:
                    print(f"Blocker: {blocker}")
            else:
                print("All V1 phases recorded complete. Next: owner local acceptance testing; V2 is not authorized.")
        else:
            require(args.number is not None and 0 <= args.number < len(phases), "Choose phase 0–6")
            require(pending is not None, "V1 already recorded complete; do not restart implementation")
            require(args.number == pending["id"], f"Cannot skip/restart phases. Next eligible phase is {pending['id']}")
            print(document(pending["spec"]).read_text())
            print("Read-only selection. No phase was started and no status was changed.")
    except (ValueError, KeyError, TypeError, IndexError, OSError) as error:
        print(f"PLAN ERROR: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
