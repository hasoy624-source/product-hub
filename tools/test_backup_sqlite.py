import importlib.util
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

spec = importlib.util.spec_from_file_location("backup_sqlite", Path(__file__).with_name("backup_sqlite.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BackupTest(unittest.TestCase):
    def test_roundtrip_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source, snapshot, restored = [root / x for x in ("source.db", "snapshot.db", "restored.db")]
            with closing(sqlite3.connect(source)) as conn:
                conn.execute("create table sample (value integer)")
                conn.execute("insert into sample values (12345)")
                conn.commit()
            self.assertEqual(module.run("backup", source, snapshot)["integrity_check"], "ok")
            self.assertEqual(module.run("restore", snapshot, restored)["integrity_check"], "ok")
            with closing(sqlite3.connect(restored)) as conn:
                self.assertEqual(conn.execute("select value from sample").fetchone()[0], 12345)
            with self.assertRaises(ValueError):
                module.run("restore", snapshot, restored)

    def test_manifest_mismatch_blocks_restore(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source, snapshot = root / "source.db", root / "snapshot.db"
            with closing(sqlite3.connect(source)) as conn:
                conn.execute("create table sample (id integer)")
            module.run("backup", source, snapshot)
            path = snapshot.with_suffix(".db.json")
            data = json.loads(path.read_text(encoding="utf-8"))
            data["sha256"] = "invalid"
            path.write_text(json.dumps(data), encoding="utf-8")
            with self.assertRaises(ValueError):
                module.run("restore", snapshot, root / "restored.db")
            self.assertFalse((root / "restored.db").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
