#!/usr/bin/env python3
"""Check evidence structure and freshness, not truth or execution authenticity.

Only fixed read-only Git commands run here; commands written in reports never run.
Fingerprint: HEAD plus sorted tracked and non-ignored untracked paths, contents,
executable bits, symlink targets and deletions. Git metadata/ignored files are not
covered. Submodules are rejected because their nested working trees need a separate
run. Runtime state is worktree-local Git metadata, never a tracked project file.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys


SCHEMA = 1
FEEDBACK_PATH = "docs/agent-feedback.json"
PLAN_FIELDS = ("goal", "scope", "non_goals", "risks", "assumptions",
               "validation_strategy", "review_strategy", "ci_strategy")
VIEWPOINTS = ("requirements", "design", "implementation", "code", "ux", "qa",
              "reliability", "security", "release")
REQUIRED = {
    "code": {"requirements", "implementation", "code", "qa"},
    "ui": {"requirements", "design", "implementation", "code", "ux", "qa"},
    "docs": {"requirements", "qa", "release"},
    "research": {"requirements", "design", "qa"},
}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=True).encode()).hexdigest()


def git(repo, *args):
    result = subprocess.run(["git", "-C", str(repo), *args], capture_output=True,
                            timeout=10, check=True)
    return result.stdout


def root(path):
    return Path(os.fsdecode(git(path, "rev-parse", "--show-toplevel")).strip()).resolve()


def contained_without_symlinks(base, path):
    """Validate existing components before resolving or writing runtime state."""
    path = Path(path).absolute()
    try:
        relative = path.relative_to(base)
    except ValueError as exc:
        raise ValueError("State path is outside the worktree Git metadata") from exc
    if ".." in relative.parts:
        raise ValueError("Parent traversal is not allowed in state paths")
    current = base
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError("Symlinks are not allowed in runtime state: " + str(current))
    return path


def state_dir(repo):
    # Resolve Git's own worktree indirection, then refuse indirection in our state.
    git_dir = Path(os.fsdecode(git(repo, "rev-parse", "--absolute-git-dir")).strip()).resolve(strict=True)
    path = contained_without_symlinks(git_dir, git_dir / "codex-harness")
    for child in ("sessions", "runs"):
        contained_without_symlinks(git_dir, path / child)
    return path


def checked_state_path(repo, path):
    return contained_without_symlinks(state_dir(repo), path)


def fingerprint(repo):
    # --cached includes tracked files even when a later ignore rule matches them.
    paths = sorted(set(git(repo, "ls-files", "--cached", "--others",
                           "--exclude-standard", "-z").split(b"\0")) - {b""})
    entries = []
    for raw in paths:
        path = repo / os.fsdecode(raw)
        try:
            mode = path.lstat().st_mode
        except FileNotFoundError:
            entries.append([raw.hex(), "deleted"])
            continue
        if stat.S_ISLNK(mode):
            contents = os.fsencode(os.readlink(path))
            kind = "symlink"
        elif stat.S_ISREG(mode):
            contents = path.read_bytes()
            kind = "executable" if mode & 0o111 else "file"
        else:
            raise ValueError("Unsupported tracked path (including submodules): " + str(path))
        entries.append([raw.hex(), kind, hashlib.sha256(contents).hexdigest()])
    # An unborn branch is supported; other repository errors still fail above.
    head = subprocess.run(["git", "-C", str(repo), "rev-parse", "--verify", "HEAD"],
                          capture_output=True, timeout=10)
    if head.returncode not in (0, 128):
        raise ValueError("Cannot determine HEAD")
    return digest({"head": head.stdout.decode().strip() or "unborn", "files": entries})


def read_json(path):
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("JSON document must be an object")
    return value


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + "." + str(os.getpid()) + ".tmp")
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            os.chmod(temporary, 0o600)
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def session_path(repo, session_id):
    if not isinstance(session_id, str) or not session_id.strip():
        raise ValueError("A nonempty session_id is required")
    base = state_dir(repo)
    contained_without_symlinks(base, base / "runs" / digest(session_id))
    return contained_without_symlinks(base, base / "sessions" / (digest(session_id) + ".json"))


def evidence_hash(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise ValueError("Evidence must be an existing regular file: " + str(path))
    data = path.read_bytes()
    if not data:
        raise ValueError("Evidence file is empty: " + str(path))
    return hashlib.sha256(data).hexdigest()


def feedback_path(repo):
    """The sole project ledger is data, never an installer or executable input."""
    path = repo / FEEDBACK_PATH
    for component in (path.parent, path):
        if component.is_symlink():
            raise ValueError("Symlinks are not allowed in feedback paths: " + str(component))
    if path.parent.exists() and not path.parent.is_dir():
        raise ValueError("Feedback directory must be a directory")
    if path.exists() and not path.is_file():
        raise ValueError("Feedback ledger must be a regular file")
    return path


def ensure_feedback_not_ignored(repo):
    result = subprocess.run(["git", "-C", str(repo), "check-ignore", "--quiet", "--", FEEDBACK_PATH],
                            capture_output=True, timeout=10)
    if result.returncode == 0:
        raise ValueError("Feedback ledger is ignored; make " + FEEDBACK_PATH + " trackable first")
    if result.returncode != 1:
        raise ValueError("Cannot check whether the feedback ledger is ignored")


def validate_feedback(ledger):
    if (set(ledger) != {"version", "items"} or type(ledger.get("version")) is not int
            or ledger["version"] != 1 or not isinstance(ledger.get("items"), list)):
        raise ValueError("Feedback ledger requires version 1 and an items array")
    by_id = {}
    for item in ledger["items"]:
        if not isinstance(item, dict) or set(item) - {
                "id", "rule", "source", "scope", "status", "superseded_by"}:
            raise ValueError("Feedback items must contain only declared ledger fields")
        identifier = item.get("id")
        if not isinstance(identifier, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", identifier):
            raise ValueError("Feedback IDs must be 1-80 safe characters")
        if identifier in by_id:
            raise ValueError("Duplicate feedback ID: " + identifier)
        for field in ("rule", "source", "scope"):
            value = item.get(field)
            if not isinstance(value, str) or not value.strip() or len(value) > 2000:
                raise ValueError("Feedback " + identifier + " needs concise " + field)
        if item.get("status") not in ("active", "superseded"):
            raise ValueError("Feedback " + identifier + " has invalid status")
        if item["status"] == "superseded" and "superseded_by" not in item:
            raise ValueError("Superseded feedback must name a replacement ID")
        if "superseded_by" in item and (item["status"] != "superseded"
                or not isinstance(item["superseded_by"], str)):
            raise ValueError("Only superseded feedback may name a replacement")
        by_id[identifier] = item
    for identifier, item in by_id.items():
        seen = {identifier}
        while "superseded_by" in item:
            replacement = item["superseded_by"]
            if replacement not in by_id or replacement in seen:
                raise ValueError("Feedback supersession must reference an existing, noncyclic ID")
            seen.add(replacement)
            item = by_id[replacement]
    return ledger


def load_feedback(repo):
    path = feedback_path(repo)
    if not path.exists():
        if git(repo, "ls-files", "--cached", "-z", "--", FEEDBACK_PATH):
            raise ValueError("Tracked feedback ledger is missing: " + FEEDBACK_PATH)
        return {"version": 1, "items": []}
    ensure_feedback_not_ignored(repo)
    if path.stat().st_size > 262144:
        raise ValueError("Feedback ledger exceeds the 256 KiB limit")
    return validate_feedback(read_json(path))


def active_feedback(repo):
    return sorted((item for item in load_feedback(repo)["items"] if item["status"] == "active"),
                  key=lambda item: item["id"])


def feedback_add(args):
    repo = root(args.repo)
    ledger = load_feedback(repo)
    ensure_feedback_not_ignored(repo)
    item = {"id": args.id, "rule": args.rule, "source": args.source,
            "scope": args.scope, "status": "active"}
    existing = next((row for row in ledger["items"] if row["id"] == args.id), None)
    supersedes = getattr(args, "supersedes", None)
    previous = next((row for row in ledger["items"] if row["id"] == supersedes), None)
    if existing:
        if existing != item or (supersedes and (not previous
                or previous.get("superseded_by") != args.id)):
            raise ValueError("Conflicting feedback ID; existing entries cannot be overwritten: " + args.id)
        return {"path": FEEDBACK_PATH, "status": "unchanged", "id": args.id}
    if supersedes:
        if not previous or previous["status"] != "active" or supersedes == args.id:
            raise ValueError("--supersedes must name an existing active feedback ID")
        previous.update(status="superseded", superseded_by=args.id)
    ledger["items"].append(item)
    validate_feedback(ledger)
    if len((json.dumps(ledger, ensure_ascii=False, indent=2) + "\n").encode("utf-8")) > 262144:
        raise ValueError("Feedback ledger exceeds the 256 KiB limit; existing ledger was not changed")
    write_json(feedback_path(repo), ledger)
    return {"path": FEEDBACK_PATH, "status": "added", "id": args.id}


def feedback_context(items):
    preview = " | ".join(item["id"] + " [" + " ".join(item["scope"].split()) + "]: "
                         + " ".join(item["rule"].split()) for item in items)
    if len(preview) > 800:
        preview = preview[:797] + "..."
        notice = " Preview truncated; omitted feedback must be read from the full ledger."
    else:
        notice = " Read the full ledger when planning; the preview is not an acknowledgement."
    return (" Active project feedback: " + str(len(items)) + "; path=" + FEEDBACK_PATH + ". "
            + preview + notice)


def plan_errors(report, items, registered=True):
    errors = []
    plan = report.get("plan")
    if not isinstance(plan, dict):
        return ["Missing plan; start a new run and register a plan before implementation"]
    for field in PLAN_FIELDS:
        value = plan.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > 2000:
            errors.append("Plan needs concise " + field)
    checks = report.get("checks", [])
    requirements = report.get("requirements", [])
    def identifiers(rows, label):
        values = {row["id"] for row in rows if isinstance(row, dict)
                  and isinstance(row.get("id"), str) and row["id"].strip()} if isinstance(rows, list) else set()
        if not isinstance(rows, list) or not rows or len(values) != len(rows):
            errors.append("Plan needs " + label + " as a nonempty array with unique nonempty IDs")
        return values

    check_ids = identifiers(checks, "checks")
    req_ids = identifiers(requirements, "requirements")
    steps = plan.get("steps")
    planned_checks = set()
    if not isinstance(steps, list) or not steps:
        errors.append("Plan needs at least one step")
    else:
        for step in steps:
            if (not isinstance(step, dict) or not isinstance(step.get("action"), str)
                    or not step["action"].strip() or len(step["action"]) > 2000
                    or not isinstance(step.get("checks"), list) or not step["checks"]
                    or any(not isinstance(key, str) or key not in check_ids for key in step["checks"])):
                errors.append("Plan steps need an action and existing check IDs")
            else:
                planned_checks.update(step["checks"])
    for requirement in requirements if isinstance(requirements, list) else []:
        if not isinstance(requirement, dict):
            continue
        label = "Plan requirement " + str(requirement.get("id"))
        if any(not isinstance(requirement.get(field), str) or not requirement[field].strip()
               for field in ("source", "acceptance")):
            errors.append(label + " needs source/acceptance")
        if requirement.get("validation") not in ("static", "runtime"):
            errors.append(label + " needs validation type")
        linked = requirement.get("checks")
        if not isinstance(linked, list) or not linked or any(
                not isinstance(key, str) or key not in check_ids for key in linked):
            errors.append(label + " needs valid nonempty check references")
        elif not set(linked) <= planned_checks:
            errors.append(label + " has acceptance-linked checks missing from plan steps")
    decisions = plan.get("feedback_decisions")
    active_ids = {item["id"] for item in items}
    seen = set()
    if not isinstance(decisions, list):
        errors.append("Plan needs feedback_decisions for all active feedback IDs")
        decisions = []
    for decision in decisions:
        if (not isinstance(decision, dict) or not isinstance(decision.get("id"), str)
                or decision["id"] not in active_ids or decision["id"] in seen):
            errors.append("Feedback decisions contain duplicate, unknown or stale IDs")
            continue
        seen.add(decision["id"])
        if decision.get("decision") == "apply":
            refs = decision.get("requirement_ids")
            if not isinstance(refs, list) or not refs or any(
                    not isinstance(key, str) or key not in req_ids for key in refs):
                errors.append("Applied feedback " + decision["id"] + " needs requirement IDs")
        elif decision.get("decision") == "not_applicable":
            reason = decision.get("reason")
            if (not isinstance(reason, str) or not reason.strip() or len(reason) > 2000
                    or reason.strip().lower() in ("na", "n/a", "none", "tbd", "todo", "該当なし",
                                                  "対象外", "not applicable", "not relevant", "out of scope")):
                errors.append("Feedback " + decision["id"] + " not_applicable needs a concrete reason")
        else:
            errors.append("Feedback " + decision["id"] + " needs an apply/not_applicable decision")
    if seen != active_ids:
        errors.append("Plan is missing active feedback acknowledgements")
    if registered:
        original = report.get("planning_receipt")
        history = report.get("planning_history")
        if (not isinstance(original, dict) or not isinstance(history, list)
                or any(not isinstance(row, dict) or not isinstance(row.get("revision_reason"), str)
                       or not row["revision_reason"].strip() for row in history)):
            errors.append("Plan must be registered with the plan command before evidence")
        else:
            if (original.get("source_fingerprint") != report.get("initial_fingerprint")
                    or original.get("feedback_digest") != report.get("initial_feedback_digest")):
                errors.append("Original planning receipt does not match the run's initial snapshot")
            receipt = history[-1] if history else original
            for field, value in (("plan_digest", digest(plan)),
                                 ("requirements_digest", digest(requirements)),
                                 ("feedback_digest", digest(items))):
                if receipt.get(field) != value:
                    errors.append("Registered plan has stale " + field + "; register a reasoned revision")
    return errors


def planning_errors(report, repo, items):
    errors = plan_errors(report, items)
    try:
        state = read_json(session_path(repo, report.get("session_id")))
        receipts = state.get("planning_receipts", {})
        if (state.get("session_id") != report.get("session_id") or not isinstance(receipts, dict)
                or receipts.get(str(report.get("run_id"))) != digest(
                    [report.get("planning_receipt"), report.get("planning_history")])):
            errors.append("Planning receipt/history is not registered for this run")
    except (OSError, ValueError) as exc:
        errors.append("Cannot verify planning registration: " + str(exc))
    return errors


def register_plan(args):
    repo = root(args.repo)
    report_path = checked_state_path(repo, args.report)
    report = read_json(report_path)
    sid = report.get("session_id")
    path = session_path(repo, sid)
    state = read_json(path)
    if (report.get("repo") != str(repo) or type(report.get("schema_version")) is not int
            or report["schema_version"] != SCHEMA or report.get("completion") is not None
            or state.get("session_id") != sid or state.get("active_report") != str(report_path)
            or state.get("active_run_id") != report.get("run_id")
            or report_path.parent != state_dir(repo) / "runs" / digest(sid)):
        raise ValueError("Plan requires this session's open active run")
    items = active_feedback(repo)
    errors = plan_errors(report, items, registered=False)
    if errors:
        raise ValueError("; ".join(errors))
    current = fingerprint(repo)
    receipt = {"source_fingerprint": current, "plan_digest": digest(report["plan"]),
               "requirements_digest": digest(report["requirements"]), "feedback_digest": digest(items)}
    original = report.get("planning_receipt")
    history = report.get("planning_history")
    reason = getattr(args, "revision_reason", None)
    receipts = state.setdefault("planning_receipts", {})
    if not isinstance(receipts, dict):
        raise ValueError("Invalid planning registration state")
    registered = receipts.get(report["run_id"])
    if original is None:
        if registered or history != []:
            raise ValueError("Original planning receipt cannot be removed or replaced")
        if reason:
            raise ValueError("A plan revision requires a prior valid planning receipt")
        if (current != state.get("active_start_fingerprint")
                or report.get("initial_fingerprint") != current
                or report.get("initial_feedback_digest") != digest(items)):
            raise ValueError("First plan must be registered before source or feedback changes; start a new run")
        report["planning_receipt"] = receipt
    else:
        if (not isinstance(original, dict) or not isinstance(history, list)
                or digest([original, history]) != registered):
            raise ValueError("Plan revision requires an unchanged prior valid planning receipt/history")
        if not isinstance(reason, str) or not reason.strip():
            raise ValueError("An existing plan requires --revision-reason")
        receipt["revision_reason"] = reason
        report["planning_history"].append(receipt)
    receipts[report["run_id"]] = digest([report["planning_receipt"], report["planning_history"]])
    write_json(report_path, report)
    write_json(path, state)
    return {"status": "planned", "report": str(report_path), "receipt": receipt}


def check_report(report, repo, session_id=None):
    """Fail closed on missing, inconsistent, stale or explicitly unverified claims."""
    if not isinstance(report, dict):
        raise ValueError("Report must be a JSON object")
    errors = []

    def need(condition, message):
        if not condition:
            errors.append(message)

    def text(value):
        return isinstance(value, str) and bool(value.strip())

    def rows(key):
        value = report.get(key)
        if not isinstance(value, list) or any(not isinstance(row, dict) for row in value):
            errors.append(key + " must be an array of objects")
            return []
        identifiers = [row.get("id") for row in value]
        need(all(text(item) for item in identifiers), key + " needs nonempty IDs")
        need(len(set(map(str, identifiers))) == len(identifiers), key + " has duplicate IDs")
        return value

    def refs(value, known, label):
        valid = isinstance(value, list) and bool(value) and all(
            isinstance(item, str) and item in known for item in value)
        need(valid, label + " needs valid nonempty references")
        return value if valid else []

    need(type(report.get("schema_version")) is int and report["schema_version"] == SCHEMA,
         "Unsupported schema_version")
    for key in ("run_id", "session_id", "implementer"):
        need(text(report.get(key)), key + " is required")
    if session_id is not None:
        need(report.get("session_id") == session_id, "Report belongs to a different session")
    need(report.get("repo") == str(repo), "Report belongs to a different repository")
    kind = report.get("kind")
    need(isinstance(kind, str) and kind in REQUIRED, "Unknown work kind")
    current = fingerprint(repo)
    need(report.get("target_fingerprint") == current, "Target working tree is stale")
    completion = report.get("completion")
    if completion is not None:
        need(isinstance(completion, dict) and completion.get("status") == "pass",
             "Closed incomplete run cannot be treated as pass")
    requirements, checks, evidence, findings = [rows(key) for key in
                                               ("requirements", "checks", "evidence", "findings")]
    need(bool(requirements), "At least one acceptance requirement is required")
    check_ids = {row.get("id") for row in checks if isinstance(row.get("id"), str)}
    req_ids = {row.get("id") for row in requirements if isinstance(row.get("id"), str)}
    evidence_ids = {row.get("id") for row in evidence if isinstance(row.get("id"), str)}
    req_hash, finding_hash = digest(requirements), digest(findings)
    feedback = active_feedback(repo)
    errors.extend(planning_errors(report, repo, feedback))
    plan_hash, feedback_hash = digest(report.get("plan")), digest(feedback)
    for item in evidence:
        label = "Evidence " + str(item.get("id"))
        need(item.get("fingerprint") == current, label + " is from a stale working tree")
        need(item.get("requirements_digest") == req_hash, label + " predates current requirements")
        need(item.get("findings_digest") == finding_hash, label + " predates current findings")
        need(item.get("plan_digest") == plan_hash, label + " predates current plan")
        need(item.get("feedback_digest") == feedback_hash, label + " predates current feedback")
        try:
            path = Path(item["path"])
            need(path.is_absolute(), label + " path must be absolute")
            need(evidence_hash(path) == item.get("sha256"), label + " hash does not match")
        except (OSError, ValueError, KeyError, TypeError) as exc:
            errors.append(label + ": " + str(exc))
    for item in checks:
        label = "Check " + str(item.get("id"))
        need(item.get("status") == "pass", label + " is not pass")
        need(item.get("mode") in ("real", "equivalent", "mock", "static"), label + " has invalid mode")
        for count in ("executed", "assertions"):
            value = item.get(count)
            need(type(value) is int and value > 0, label + " has no " + count)
        need(text(item.get("expected")) and text(item.get("actual")), label + " needs expected/actual")
        refs(item.get("evidence"), evidence_ids, label + " evidence")
        if item.get("mode") == "equivalent":
            need(text(item.get("equivalence")), label + " needs an equivalence explanation")
    check_map = {row.get("id"): row for row in checks if isinstance(row.get("id"), str)}
    acceptance_checks = set()
    for item in requirements:
        label = "Requirement " + str(item.get("id"))
        need(text(item.get("source")) and text(item.get("acceptance")), label + " needs source/acceptance")
        need(item.get("validation") in ("static", "runtime"), label + " needs validation type")
        linked = refs(item.get("checks"), check_ids, label + " checks")
        acceptance_checks.update(linked)
        if item.get("validation") == "runtime":
            need(any(check_map[key].get("mode") in ("real", "equivalent") for key in linked),
                 label + " requires real or equivalent execution; mock/static is insufficient")
    if kind == "ui":
        need(any(check_map[key].get("mode") in ("real", "equivalent")
                 for key in acceptance_checks),
             "UI work requires real or equivalent execution linked to acceptance")
    viewpoints = report.get("viewpoints")
    if not isinstance(viewpoints, dict):
        viewpoints = {}
        errors.append("viewpoints must be an object")
    reviewed = set()
    for name in VIEWPOINTS:
        item = viewpoints.get(name)
        if not isinstance(item, dict):
            errors.append("Missing viewpoint: " + name)
            continue
        if item.get("status") == "na":
            need(text(item.get("reason")), name + " N/A needs a reason")
            need(name not in REQUIRED.get(kind if isinstance(kind, str) else "", set()),
                 name + " is required for this work kind")
            continue
        need(item.get("status") == "pass", name + " is not pass or reasoned N/A")
        need(text(item.get("reviewer")) and item.get("reviewer") != report.get("implementer"),
             name + " requires a reviewer distinct from the implementer")
        refs(item.get("evidence"), evidence_ids, name + " evidence")
        covered = refs(item.get("requirements"), req_ids, name + " requirements")
        reviewed.update(covered)
        if name == "requirements":
            need(req_ids <= set(covered), "Requirements viewpoint must review every acceptance requirement")
    need(req_ids <= reviewed, "Some acceptance requirements have no independent review")
    for item in findings:
        label = "Finding " + str(item.get("id"))
        need(type(item.get("required")) is bool and text(item.get("summary")), label + " needs required/summary")
        need(item.get("status") in ("open", "resolved"), label + " has invalid status")
        if item.get("required") is True:
            need(item.get("status") == "resolved", label + " is unresolved and required")
            if item.get("status") == "resolved":
                refs(item.get("checks"), check_ids, label + " rechecks")
    # This gate never confers external write, merge or publication authorization.
    publication = report.get("publication")
    need(isinstance(publication, dict) and set(publication) == {"authorized"}
         and publication["authorized"] is False,
         "Publication authorization must remain separate from this local gate")
    return {"status": "fail" if errors else "pass", "errors": errors,
            "fingerprint": current, "publication_authorized": False}


def init_run(args):
    repo = root(args.repo)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", args.run_id):
        raise ValueError("run-id must be 1-80 safe filename characters")
    session = session_path(repo, args.session_id)
    base = state_dir(repo)
    report_path = contained_without_symlinks(
        base, base / "runs" / digest(args.session_id) / (args.run_id + ".json"))
    if report_path.exists():
        raise ValueError("Run already exists; refusing to overwrite evidence")
    current = fingerprint(repo)
    feedback = active_feedback(repo)
    requirements = [{"id": "a" + str(i), "source": args.source, "acceptance": value,
                     "validation": "runtime" if args.kind == "ui" else "static",
                     "checks": ["c" + str(i)]} for i, value in enumerate(args.acceptance, 1)]
    report = {"schema_version": SCHEMA, "run_id": args.run_id, "session_id": args.session_id,
              "repo": str(repo), "kind": args.kind, "implementer": args.implementer,
              "initial_fingerprint": current, "initial_feedback_digest": digest(feedback),
              "target_fingerprint": current, "requirements": requirements,
              "plan": {**{field: "" for field in PLAN_FIELDS}, "steps": [],
                       "feedback_decisions": [{"id": item["id"], "decision": ""} for item in feedback]},
              "planning_receipt": None, "planning_history": [],
              "checks": [{"id": "c" + str(i), "status": "unverified",
                          "mode": "real" if args.kind == "ui" else "static",
                          "executed": 0, "assertions": 0, "expected": value,
                          "actual": "", "evidence": []} for i, value in enumerate(args.acceptance, 1)],
              "viewpoints": {name: {"status": "unverified", "reviewer": "", "reason": "",
                                    "evidence": [], "requirements": [r["id"] for r in requirements]}
                             for name in VIEWPOINTS},
              "evidence": [], "findings": [], "publication": {"authorized": False}}
    state = read_json(session) if session.exists() else {}
    if state.get("active_report"):
        raise ValueError("Session already has an active run; finish it or use another session")
    write_json(report_path, report)
    state.pop("state_error", None)
    state.update({"session_id": args.session_id, "baseline": state.get("baseline", current),
                  "active_report": str(report_path), "active_run_id": args.run_id,
                  "active_start_fingerprint": current,
                  "blocks": 0, "status": "unverified"})
    write_json(session, state)
    return {"report": str(report_path), "status": "unverified", "fingerprint": current}


def record(args):
    repo = root(args.repo)
    report_path = checked_state_path(repo, args.report)
    report = read_json(report_path)
    if (report.get("repo") != str(repo) or type(report.get("schema_version")) is not int
            or report["schema_version"] != SCHEMA):
        raise ValueError("Report repository/schema does not match")
    if report.get("completion") is not None:
        raise ValueError("Run is closed; start a new run instead of replacing its evidence")
    feedback = active_feedback(repo)
    errors = planning_errors(report, repo, feedback)
    if errors:
        raise ValueError("; ".join(errors))
    path = Path(args.file).resolve()
    if path == report_path:
        raise ValueError("The report itself is not evidence")
    item = {"id": args.id, "path": str(path), "sha256": evidence_hash(path),
            "fingerprint": fingerprint(repo), "requirements_digest": digest(report["requirements"]),
            "findings_digest": digest(report["findings"]), "plan_digest": digest(report["plan"]),
            "feedback_digest": digest(feedback)}
    previous = report.get("evidence")
    if not isinstance(previous, list) or any(not isinstance(row, dict) for row in previous):
        raise ValueError("evidence must be an array of objects")
    report["evidence"] = [row for row in previous if row.get("id") != args.id] + [item]
    report["target_fingerprint"] = item["fingerprint"]
    write_json(report_path, report)
    return item


def close_run(args, paused=False):
    repo = root(args.repo)
    report_path = checked_state_path(repo, args.report)
    report = read_json(report_path)
    sid = report.get("session_id")
    path = session_path(repo, sid)
    state = read_json(path)
    if (report.get("repo") != str(repo) or state.get("session_id") != sid
            or state.get("active_report") != str(report_path)
            or state.get("active_run_id") != report.get("run_id")
            or report_path.parent != state_dir(repo) / "runs" / digest(sid)):
        raise ValueError("Report is not this session's active run")
    if paused:
        if not args.reason.strip():
            raise ValueError("Pausing requires a nonempty reason")
        result = {"status": "paused", "errors": ["Work remains incomplete: " + args.reason],
                  "fingerprint": fingerprint(repo), "publication_authorized": False}
    else:
        result = check_report(report, repo, sid)
    if result["status"] == "fail":
        state.update(status="fail", errors=result["errors"])
    else:
        report["completion"] = {"status": result["status"], "fingerprint": result["fingerprint"]}
        if paused:
            report["completion"]["reason"] = args.reason
        write_json(report_path, report)
        state.update(status=result["status"], active_report=None, active_run_id=None,
                     last_report=str(report_path), baseline=result["fingerprint"],
                     errors=result["errors"], blocks=0)
    write_json(path, state)
    return result


def hook(payload):
    if not isinstance(payload, dict):
        raise ValueError("Hook payload must be an object")
    event = payload.get("hook_event_name")
    if event not in ("SessionStart", "UserPromptSubmit", "Stop"):
        raise ValueError("Unsupported or missing hook_event_name")
    repo = root(payload["cwd"])
    sid = payload.get("session_id")
    path = session_path(repo, sid)
    try:
        state = read_json(path) if path.exists() else {}
        if state and state.get("session_id") != sid:
            raise ValueError("Session state identity does not match")
    except (OSError, ValueError) as exc:
        # Preserve the failure; recovery uses a bounded block, never a pass fallback.
        state = {"session_id": sid, "status": "fail", "state_error": str(exc), "blocks": 0}
    current = fingerprint(repo)
    try:
        feedback = active_feedback(repo)
        feedback_error = None
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        feedback, feedback_error = [], "Cannot load project feedback: " + str(exc)
    if event in ("SessionStart", "UserPromptSubmit"):
        if (not state.get("active_report") and not state.get("state_error")
                and state.get("status") != "fail" and not feedback_error):
            state.update({"baseline": current, "status": "unverified"})
        if feedback_error:
            state.update(status="fail", feedback_error=feedback_error)
        else:
            state.pop("feedback_error", None)
        state.update({"session_id": sid, "blocks": 0})
        write_json(path, state)
        context = ("Codex evidence session_id=" + sid + ". State: " + state.get("status", "unverified") +
                   ". For a change task, use python3 .codex/hooks/codex_harness.py --help; "
                   "init and register a plan with this session ID before changes. "
                   "An incomplete run needs evidence or an explicit pause.")
        context += " " + feedback_error if feedback_error else feedback_context(feedback)
        return {"hookSpecificOutput": {"hookEventName": event, "additionalContext": context}}
    errors = []
    if feedback_error:
        errors.append(feedback_error)
    if state.get("state_error"):
        errors.append("Cannot read session state: " + state["state_error"])
    active = state.get("active_report")
    if active:
        try:
            active_path = checked_state_path(repo, active)
            expected_dir = state_dir(repo) / "runs" / digest(sid)
            if active_path.parent != expected_dir:
                raise ValueError("Active report is outside this session's run directory")
            active_report = read_json(active_path)
            if active_report.get("run_id") != state.get("active_run_id"):
                raise ValueError("Active report belongs to a different run")
            result = check_report(active_report, repo, sid)
            errors.extend(result["errors"])
        except (OSError, ValueError, TypeError, KeyError, subprocess.SubprocessError) as exc:
            errors.append("Cannot validate active run: " + str(exc))
    elif state.get("baseline") and state["baseline"] != current:
        errors.append("Working tree changed without an active run. Run init, record acceptance/review evidence, then check.")
    elif not state.get("baseline") and not errors:
        # There is no evidence of a changed task. Do not claim a pass or block unrelated chat.
        state.update({"session_id": sid, "status": "unverified",
                      "errors": ["No session baseline; hook coverage is unverified"]})
        write_json(path, state)
        print(state["errors"][0], file=sys.stderr)
        return {}
    if errors:
        state.update({"session_id": sid, "status": "fail", "errors": errors})
        blocked = state.get("blocks", 0)
        if not payload.get("stop_hook_active") and type(blocked) is int and blocked < 1:
            state["blocks"] = 1
            write_json(path, state)
            return {"decision": "block", "reason": "Evidence gate incomplete: " + "; ".join(errors[:5]) +
                    ". Repair the evidence or explicitly report incomplete work; this hook retries once."}
        write_json(path, state)
        print("Evidence gate failed; retry budget exhausted. Work remains incomplete: " +
              "; ".join(errors[:5]), file=sys.stderr)
        return {}
    state.update({"session_id": sid, "status": "pass" if active else "no_change",
                  "baseline": current, "last_report": active or state.get("last_report"),
                  "active_report": None, "active_run_id": None, "errors": []})
    write_json(path, state)
    if active:
        active_report["completion"] = {"status": "pass", "fingerprint": current}
        write_json(active, active_report)
    return {}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("init", "fingerprint", "feedback-add", "plan", "record", "check", "finish", "pause"):
        command = commands.add_parser(name)
        command.add_argument("--repo", default=".")
        if name in ("plan", "record", "check", "finish", "pause"):
            command.add_argument("--report", required=True)
        if name == "plan":
            command.add_argument("--revision-reason")
        if name == "feedback-add":
            for key in ("id", "rule", "source", "scope"):
                command.add_argument("--" + key, required=True)
            command.add_argument("--supersedes")
        if name == "pause":
            command.add_argument("--reason", required=True)
        if name == "check":
            command.add_argument("--session-id")
        if name == "record":
            command.add_argument("--id", required=True)
            command.add_argument("--file", required=True)
        if name == "init":
            for key in ("session-id", "run-id", "implementer", "source"):
                command.add_argument("--" + key, required=True)
            command.add_argument("--kind", choices=sorted(REQUIRED), required=True)
            command.add_argument("--acceptance", action="append", required=True)
    commands.add_parser("hook")
    args = parser.parse_args(argv)
    try:
        if args.command == "init":
            result = init_run(args)
        elif args.command == "fingerprint":
            result = {"fingerprint": fingerprint(root(args.repo))}
        elif args.command == "record":
            result = record(args)
        elif args.command == "feedback-add":
            result = feedback_add(args)
        elif args.command == "plan":
            result = register_plan(args)
        elif args.command == "check":
            result = check_report(read_json(args.report), root(args.repo), args.session_id)
        elif args.command in ("finish", "pause"):
            result = close_run(args, paused=args.command == "pause")
        else:
            result = hook(json.load(sys.stdin))
        print(json.dumps(result, ensure_ascii=False))
        return 1 if args.command in ("check", "finish") and result["status"] != "pass" else 0
    except (OSError, ValueError, TypeError, KeyError, subprocess.SubprocessError) as exc:
        # No success-shaped result for malformed input or unavailable Git.
        print("codex-harness error: " + str(exc), file=sys.stderr)
        if args.command != "hook":
            print(json.dumps({"status": "fail", "errors": [str(exc)]}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
