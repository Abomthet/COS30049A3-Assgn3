"""Copy Assignment 2's runtime into backend/ with a SHA-256 for every file (T03, plan section 7.3).

    python tools/vendor_a2.py --from ../COS30049A2 --commit aa56a26        copy and write A2_VENDOR.json
    python tools/vendor_a2.py --assistant-weights ~/Desktop/COS30049/A2_submitted_artifacts
                                                                           also copy the Assistant's two files (optional)
    python tools/vendor_a2.py --check                                      verify the copy against A2_VENDOR.json

Everything is read from the commit with `git cat-file`, never from the working folder, so
uncommitted work cannot leak in. Nothing in the source repository is checked out or changed, and no
model or table is rebuilt: a file that is not in the commit is an error (scope item W-06).

Which files? Not a hand-kept list. The entry points the web application uses (Predictor.load,
score_address, score_what_if, txgpt_surprisal) run once in a clean interpreter over a copy of the
commit. Every `explorer` and `lm` module that gets imported is a module to copy, and every data or
model file the run opens is a file to copy. A few files that the web application reads later (E11's
evaluation tables, the profile model) are added from EXTRA_FILES.

The Assistant's weights (models/assistant/model.pt, 610 MB, and tokenizer.json) are not in git. With
--assistant-weights they are copied from a folder holding that layout plus the submission's
SHA256SUMS.txt, and checked against it before and after the copy. backend/models/assistant/ is
git-ignored. The Assistant's five lm modules (ASSISTANT_MODULES) are copied with the runtime; backend/app/services/assistant_service.py loads them.

The saved models are pickles that name their classes by module path, so the package keeps its name
and no copied file is edited. config/settings.json is the one file that is extended (the "web"
block, T06); --check accepts it when every other key equals A2's.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND = REPO_ROOT / "backend"
MANIFEST_NAME = "A2_VENDOR.json"
SETTINGS_PATH = "config/settings.json"
WEB_KEY = "web"

# Read by the web application but not opened by the discovery run (plan section 7.3, step 3).
# profiles.joblib needs explorer.profiles, which is vendored only when the C-02 profile endpoint is built.
EXTRA_FILES = (
    "models/selection.json",
    "models/profiles.joblib",
    "reports/tables/eval_selection.csv",
    "reports/tables/eval_significance.csv",
)

# The Assistant's writer and what it imports. They need torch and tokenizers, which the web application's entry
# points never import (the Assistant loads lazily, S-05), so the discovery run cannot find them.
ASSISTANT_MODULES = (
    "lm/writers.py",
    "lm/chat.py",
    "lm/generate.py",
    "lm/model.py",
    "lm/tokenizer.py",
)

# What the discovery run needs besides the python files: the snapshot and the models are found by
# opening them, so the whole snapshot folder's four tables, the manifest and the model folder go in.
DISCOVERY_PATHS = (
    "config/",
    "models/",
    "data/processed/esplora/features.csv",
    "data/processed/esplora/transactions.csv",
    "data/processed/esplora/scores.csv",
    "data/processed/esplora/txgpt_scores.csv",
    "data/processed/esplora/manifest.json",
)

# The Assistant's files, relative to the --assistant-weights folder, which also holds SHA256SUMS.txt.
ASSISTANT_FILES = ("models/assistant/model.pt", "models/assistant/tokenizer.json")
SUMS_NAME = "SHA256SUMS.txt"

# Runs inside the clean interpreter. It prints one JSON object: the imported modules and the files opened.
DISCOVERY_SCRIPT = r"""
import json, sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(root))
opened = set()

def record(event, args):
    if event == "open" and isinstance(args[0], str):
        path = Path(args[0]).resolve()
        if root in path.parents and path.suffix not in (".py", ".pyc"):
            opened.add(path.relative_to(root).as_posix())

sys.addaudithook(record)
from explorer.predict import Predictor

predictor = Predictor.load()
busy = predictor.features.groupby("address")["txid"].count().idxmax()
predictor.score_address(busy)
predictor.score_what_if(busy, 0.05, "out", predictor.snapshot()["snapshotDate"] + "T12:00:00Z")
predictor.txgpt_surprisal(busy)
modules = sorted(m for m in sys.modules if m.split(".")[0] in ("explorer", "lm"))
print(json.dumps({"modules": modules, "files": sorted(opened)}))
"""


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git(repo: Path, *args: str) -> bytes:
    """Run a read-only git command in the source repository and return its raw output."""
    result = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, check=False)
    if result.returncode != 0:
        raise SystemExit(f"git {' '.join(args)} failed: {result.stderr.decode(errors='replace').strip()}")
    return result.stdout


def committed_files(repo: Path, commit: str, prefixes: tuple[str, ...]) -> list[str]:
    """Paths in the commit that start with one of the prefixes."""
    listing = git(repo, "ls-tree", "-r", "--name-only", commit).decode().splitlines()
    return [p for p in listing if p.startswith(prefixes)]


def blob(repo: Path, commit: str, path: str) -> bytes:
    """A file's exact bytes as stored in the commit; no line-ending conversion."""
    return git(repo, "cat-file", "blob", f"{commit}:{path}")


def discover(repo: Path, commit: str, python: str) -> tuple[list[str], list[str]]:
    """Run the web application's entry points over a copy of the commit; return (python files, other files)."""
    paths = committed_files(repo, commit, ("explorer/", "lm/") + DISCOVERY_PATHS)
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for path in paths:
            target = root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(blob(repo, commit, path))
        # -I: ignore the environment and the current folder; -B: leave no bytecode in the copy.
        run = subprocess.run([python, "-I", "-B", "-c", DISCOVERY_SCRIPT, str(root)],
                             capture_output=True, text=True, check=False)
        if run.returncode != 0:
            raise SystemExit("The discovery run failed (is the environment cos30049-a3 active?):\n" + run.stderr)
    found = json.loads(run.stdout.strip().splitlines()[-1])
    modules = []
    for name in found["modules"]:
        as_file = name.replace(".", "/")
        modules.append(f"{as_file}/__init__.py" if f"{as_file}/__init__.py" in paths else f"{as_file}.py")
    return modules, found["files"]


def file_sha256(path: Path) -> str:
    """SHA-256 of a large file, read in chunks."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copy_assistant(source: Path) -> dict[str, str]:
    """Copy the Assistant's files into backend/ after checking them against the submission's SHA256SUMS.txt.

    Returns:
        The SHA-256 of each copied file, by path relative to backend/.
    """
    sums = {}
    for line in (source / SUMS_NAME).read_text(encoding="utf-8").splitlines():
        digest, _, name = line.partition("  ")
        sums[name.strip()] = digest
    copied = {}
    for path in ASSISTANT_FILES:
        if path not in sums:
            raise SystemExit(f"{path} is not listed in {source / SUMS_NAME}.")
        origin = source / path
        if not origin.is_file() or file_sha256(origin) != sums[path]:
            raise SystemExit(f"{origin} is missing or does not match {SUMS_NAME}; nothing was copied.")
        target = BACKEND / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(origin, target)
        if file_sha256(target) != sums[path]:
            raise SystemExit(f"{target} differs from its source after the copy.")
        copied[path] = sums[path]
    return copied


def copy_runtime(repo: Path, commit: str, python: str) -> dict:
    """Copy every discovered file into backend/ and return the manifest."""
    sha = git(repo, "rev-parse", f"{commit}^{{commit}}").decode().strip()  # a tag name becomes its commit
    modules, data_files = discover(repo, sha, python)
    wanted = sorted({*modules, *data_files, *EXTRA_FILES, *ASSISTANT_MODULES})
    in_commit = set(committed_files(repo, sha, ("",)))
    missing = [p for p in wanted if p not in in_commit]
    if missing:
        raise SystemExit("Not in the commit, so not copied (nothing is rebuilt in their place): " + ", ".join(missing))

    hashes = {}
    derived = {}
    for path in wanted:
        data = blob(repo, sha, path)
        target = BACKEND / path
        if path == SETTINGS_PATH:
            derived[path] = {"addedKeys": [WEB_KEY], "otherKeysSha256": keys_hash(json.loads(data), WEB_KEY)}
            if target.exists() and keys_hash(json.loads(target.read_text(encoding="utf-8")), WEB_KEY) == derived[path]["otherKeysSha256"]:
                continue  # keep the file that already carries the web block
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        hashes[path] = sha256_of(data)
    return {
        "about": "Assignment 2's runtime, copied unchanged by tools/vendor_a2.py. Do not edit these files; "
                 "web changes go in backend/app/ and are listed in MODIFICATIONS.md.",
        "source": {"repository": repo.name, "commit": sha,
                   "tags": git(repo, "tag", "--points-at", sha).decode().split(),
                   "subject": git(repo, "log", "-1", "--format=%s", sha).decode().strip()},
        "copiedUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": dict(sorted(hashes.items())),
        "derived": derived,
    }


def keys_hash(settings: dict, *ignored: str) -> str:
    """SHA-256 of a settings object's other keys, independent of spacing and key order."""
    kept = {k: v for k, v in settings.items() if k not in ignored}
    return sha256_of(json.dumps(kept, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode())


def check(manifest_path: Path) -> list[str]:
    """Problems found when comparing backend/ with the manifest; an empty list means it is intact."""
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    problems = []
    for path, expected in manifest["files"].items():
        target = BACKEND / path
        if not target.is_file():
            problems.append(f"missing: {path}")
        elif sha256_of(target.read_bytes()) != expected:
            problems.append(f"changed: {path}")
    for path in manifest["files"]:
        if path.endswith(".py"):
            folder = (BACKEND / path).parent
            for extra in sorted(folder.glob("*.py")):
                relative = extra.relative_to(BACKEND).as_posix()
                if relative not in manifest["files"]:
                    problems.append(f"not in the manifest: {relative}")
    for path, expected in manifest.get("assistant", {}).items():
        target = BACKEND / path  # git-ignored and optional: verified only when present
        if target.is_file() and file_sha256(target) != expected:
            problems.append(f"changed: {path}")
    for path, entry in manifest.get("derived", {}).items():
        target = BACKEND / path
        if not target.is_file():
            problems.append(f"missing: {path}")
            continue
        ours = json.loads(target.read_text(encoding="utf-8"))
        if keys_hash(ours, *entry["addedKeys"]) != entry["otherKeysSha256"]:
            problems.append(f"changed beyond the added keys {entry['addedKeys']}: {path}")
    return sorted(set(problems))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--from", dest="source", type=Path, default=REPO_ROOT.parent / "COS30049A2",
                        help="the Assignment 2 repository (read-only)")
    parser.add_argument("--commit", default="aa56a26", help="the commit to copy from")
    parser.add_argument("--python", default=sys.executable, help="interpreter with the model libraries, for the discovery run")
    parser.add_argument("--assistant-weights", type=Path,
                        help="folder with models/assistant/ and the submission's SHA256SUMS.txt; copies the Assistant's files")
    parser.add_argument("--check", action="store_true", help="verify backend/ against A2_VENDOR.json and exit")
    args = parser.parse_args()
    manifest_path = BACKEND / MANIFEST_NAME

    if args.check:
        problems = check(manifest_path)
        for line in problems:
            print(line)
        print("Vendored files match A2_VENDOR.json." if not problems else f"{len(problems)} problem(s).")
        return 1 if problems else 0

    manifest = copy_runtime(args.source.resolve(), args.commit, args.python)
    previous = json.loads(manifest_path.read_text(encoding="utf-8")).get("assistant", {}) if manifest_path.exists() else {}
    assistant = copy_assistant(args.assistant_weights.expanduser().resolve()) if args.assistant_weights else previous
    if assistant:
        manifest["assistant"] = assistant
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Copied {len(manifest['files'])} files from {manifest['source']['commit'][:7]} into {BACKEND}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
