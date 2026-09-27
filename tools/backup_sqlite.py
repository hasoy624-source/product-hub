"""Create a consistent online SQLite snapshot, or restore to a NEW file.

Usage:
  python tools/backup_sqlite.py backup backend/product-hub.db backups/local.db
  python tools/backup_sqlite.py restore backups/local.db backend/restored.db
Never overwrites a file. Supports a live source through SQLite's backup API.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path


def digest(path: Path) -> str:
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def run(mode: str, source: Path, target: Path) -> dict:
    source, target = source.resolve(), target.resolve()
    if not source.is_file():
        raise ValueError(f"Source does not exist: {source}")
    if source == target or target.exists():
        raise ValueError(f"Target must be a new file: {target}")
    manifest_path = source.with_suffix(source.suffix + ".json")
    if mode == "restore":
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest["sha256"] != digest(source):
            raise ValueError("Backup SHA256 does not match its manifest")
    target.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as src:
        if src.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Source database integrity check failed")
        with closing(sqlite3.connect(target)) as dst:
            src.backup(dst)
            integrity = dst.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise ValueError(f"Snapshot integrity check failed: {integrity}")
    result = {
        "mode": mode,
        "source": str(source),
        "target": str(target),
        "sha256": digest(target),
        "integrity_check": integrity,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    target.with_suffix(target.suffix + ".json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["backup", "restore"])
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.mode, args.source, args.target), ensure_ascii=False))
    except (ValueError, OSError, sqlite3.Error, KeyError) as exc:
        parser.exit(1, f"ERROR: {exc}\n")
