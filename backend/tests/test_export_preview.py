import hashlib
import json
import sqlite3
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.excel_reader import read_register
from app.import_projects import import_register
from app.export_preview import export_snapshot
from test_project_import import make_register


@pytest.fixture
def native_register(tmp_path, monkeypatch):
    monkeypatch.setenv('APP_MODE', 'demo')
    database = tmp_path / 'native.db'
    assets = tmp_path / 'original-images'
    app = create_app('sqlite:///' + database.as_posix(), seed_demo=False)
    with TestClient(app) as client:
        import_register(app.state.Session, read_register(make_register(tmp_path), assets))
        workspace = client.get('/api/workspace').json()
        for project in workspace['projects']:
            client.patch('/api/projects/' + project['id'], json={'profile': {'target': '实际项目目标'}})
    return database, assets, workspace


def test_export_preserves_native_data_and_excludes_internal_tables(native_register, tmp_path):
    database, assets, original = native_register
    before = hashlib.sha256(database.read_bytes()).hexdigest()
    output, images = tmp_path / 'published.json', tmp_path / 'published-images'
    result = export_snapshot(database, assets, output, images)
    workspace = result['workspace']
    assert len(workspace['projects']) == len(original['projects'])
    assert workspace['tasks'] == original['tasks']
    assert workspace['projects'][0]['profile']['target'] == '实际项目目标'
    assert workspace['project_details'][workspace['projects'][0]['id']]['milestones']
    assert all('import_info' not in row for row in workspace['projects'])
    assert not {'sessions', 'project_sources', 'raw_rows', 'payload'} & workspace.keys()
    assert hashlib.sha256(database.read_bytes()).hexdigest() == before
    assert json.loads(output.read_text(encoding='utf-8')) == result
    for name, digest in result['image_hashes'].items():
        assert hashlib.sha256((images / name).read_bytes()).hexdigest() == digest
        assert (assets / name).read_bytes() == (images / name).read_bytes()


def test_export_is_deterministic_and_does_not_modify_originals(native_register, tmp_path):
    database, assets, _ = native_register
    output, images = tmp_path / 'published.json', tmp_path / 'published-images'
    first = export_snapshot(database, assets, output, images)
    content = output.read_bytes()
    assert export_snapshot(database, assets, output, images) == first
    assert output.read_bytes() == content


def test_missing_image_fails_before_writing_snapshot(native_register, tmp_path):
    database, _, _ = native_register
    output = tmp_path / 'published.json'
    with pytest.raises(FileNotFoundError):
        export_snapshot(database, tmp_path / 'absent', output, tmp_path / 'published-images')
    assert not output.exists()


def test_export_rejects_image_path_traversal(native_register, tmp_path):
    database, assets, _ = native_register
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE project_images SET filename='../private-file.png'")
    with pytest.raises(ValueError, match='filename'):
        export_snapshot(database, assets, tmp_path / 'published.json', tmp_path / 'published-images')


def test_export_assets_must_be_separate_from_original_directory(native_register, tmp_path):
    database, assets, _ = native_register
    with pytest.raises(ValueError, match='separate'):
        export_snapshot(database, assets, tmp_path / 'published.json', assets)
