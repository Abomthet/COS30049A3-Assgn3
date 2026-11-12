"""Write the Explorer Assistant's guarded answers for the snapshot's flagged transactions to a JSON file (S-05, plan s07).

    python tools/precompute_assistant.py                      every flagged transaction under the baseline -> backend/data/assistant_answers.json
    python tools/precompute_assistant.py --limit 5 --out x.json     the first five only, to a file of your own (to time it)
    python tools/precompute_assistant.py --addresses A B            only those addresses

Run from anywhere, with PyTorch installed (backend/requirements-assistant.txt) and the weights in backend/models/assistant/.
The run is resumable: answers already in the file are kept (a restart continues where it stopped), and the file is
rewritten, atomically, every few answers. Decoding is greedy, so a second run writes the same text.

Each answer is the writer's text only when it passed every guardrail check; otherwise the entry records the checks it
failed and the service shows the template. The file is keyed by the SHA-256 of the facts the Assistant was given
(`assistant_service.facts_key`), so E12 finds a transaction's answer without looking at its ID, and an answer is never
served for different facts. The service checks each prepared answer with the guardrail again before it serves it.
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.core.config import ASSISTANT_ANSWERS_PATH  # noqa: E402
from app.services.assistant_service import WRITER, facts_key, prepared_entry, write_guarded  # noqa: E402
from explorer.predict import InsufficientHistory, Predictor, load_writers  # noqa: E402

ABOUT = ("The Explorer Assistant's guarded answers for the snapshot's flagged transactions, written by "
         "tools/precompute_assistant.py. Keyed by the SHA-256 of the facts the Assistant is given; an entry whose source is "
         "'template' records the guardrail checks a writer's answer failed (the rejected text is not kept).")


def flagged_transactions(predictor: Predictor, only: list[str] | None = None) -> list[tuple[str, dict]]:
    """Every scored, flagged transaction under the predictor's method, as (address, detail), by address then time."""
    found = []
    for address in sorted(predictor.features["address"].unique()):
        if only and address not in only:
            continue
        try:
            transactions = predictor.score_address(address)["transactions"]
        except InsufficientHistory:  # too little history to score anything
            continue
        found += [(address, tx) for tx in transactions if tx.get("scored") and tx.get("flagged")]
    return found


def load_existing(path: Path) -> dict[str, dict]:
    """The answers already in the file, so that a restart continues where the last run stopped."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))["answers"]
    except FileNotFoundError:
        return {}


def save(path: Path, answers: dict[str, dict], predictor: Predictor, flagged_total: int, weights_sha256: str | None) -> None:
    """Write the file atomically (a reader never sees half of it), answers ordered by address and transaction."""
    ordered = dict(sorted(answers.items(), key=lambda item: (item[1]["address"], item[1]["txid"])))
    document = {
        "about": ABOUT, "snapshotDate": predictor.snapshot_date, "method": predictor.selected,
        "model": {"file": "models/assistant/model.pt", "sha256": weights_sha256},
        "generatedUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "flaggedTransactions": flagged_total,
        "writtenByAssistant": sum(1 for a in ordered.values() if a["source"] == WRITER),
        "templateInstead": sum(1 for a in ordered.values() if a["source"] != WRITER),
        "answers": ordered,
    }
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(document, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=ASSISTANT_ANSWERS_PATH, help="the JSON file (default: backend/data/assistant_answers.json)")
    parser.add_argument("--method", default="baseline", help="whose flags decide which transactions are flagged (default: the baseline)")
    parser.add_argument("--limit", type=int, help="stop after this many answers written in this run")
    parser.add_argument("--addresses", nargs="+", help="only these addresses")
    parser.add_argument("--save-every", type=int, default=10, help="rewrite the file after this many answers")
    args = parser.parse_args()

    writers, skipped = load_writers()
    if not writers:
        print("The Assistant cannot run here: " + "; ".join(skipped.values()), file=sys.stderr)
        return 1
    predictor = dataclasses.replace(Predictor.load(), selected=args.method)
    manifest = json.loads((BACKEND / "A2_VENDOR.json").read_text(encoding="utf-8"))
    weights_sha256 = manifest.get("assistant", {}).get("models/assistant/model.pt")

    flagged = flagged_transactions(predictor, args.addresses)
    answers = load_existing(args.out)
    todo: list[tuple[str, str, dict]] = []
    seen = set(answers)
    for address, tx in flagged:
        key = facts_key(tx)
        if key not in seen:  # two transactions with equal facts share one answer
            seen.add(key)
            todo.append((key, address, tx))
    if args.limit is not None:
        todo = todo[:args.limit]
    print(f"{len(flagged)} flagged transactions under {args.method}; {len(answers)} answers already in {args.out.name}; "
          f"{len(todo)} to write.", flush=True)

    started = time.monotonic()
    try:
        for done, (key, address, tx) in enumerate(todo, start=1):
            answers[key] = prepared_entry(address, tx["txid"], write_guarded(tx, writers))
            if done % args.save_every == 0 or done == len(todo):
                save(args.out, answers, predictor, len(flagged), weights_sha256)
                elapsed = time.monotonic() - started
                rate = elapsed / done
                print(f"{done}/{len(todo)} written, {rate:.2f} s each, about {rate * (len(todo) - done) / 60:.1f} min left", flush=True)
    finally:
        save(args.out, answers, predictor, len(flagged), weights_sha256)
    passed = sum(1 for a in answers.values() if a["source"] == WRITER)
    print(f"Done: {len(answers)} answers in {args.out}: {passed} written by the Assistant and passed the guardrail, "
          f"{len(answers) - passed} fell back to the template.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
