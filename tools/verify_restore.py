"""Compare a restored SQLite DB through the API. Run from backend with its venv."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from fastapi.testclient import TestClient
from app.main import create_app

root = Path(__file__).resolve().parents[1]
summaries = []
for path in (root / "backend" / "product-hub.db", root / "test-results" / "seed-restored.db"):
    app = create_app(f"sqlite:///{path.as_posix()}", seed_demo=False)
    with TestClient(app) as client:
        data = client.get("/api/workspace").json()
        summary = client.get("/api/dashboard?month=2026-09").json()
        summaries.append((data, summary))
assert summaries[0] == summaries[1], "Restored API results differ"
print("RESTORE PASS: all workspace entities and dashboard values identical")
print(f"products={len(summaries[1][0]['products'])}; sales={len(summaries[1][0]['sales'])}; revenue_cents={summaries[1][1]['revenue_cents']}")
