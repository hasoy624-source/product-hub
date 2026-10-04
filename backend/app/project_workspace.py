"""Persistent local project space; deliberately has no demo seed or demo worker."""
import os
from pathlib import Path
from .main import create_app

root = Path(__file__).resolve().parents[1]
url = os.getenv('PROJECT_DATABASE_URL', 'sqlite:///' + (root / 'project-workspace.db').as_posix())
app = create_app(url, seed_demo=False)
app.state.workspace_kind = 'project-register'
