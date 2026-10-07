from fastapi.testclient import TestClient
from app.main import create_app


def test_api_document_title_uses_current_application_name(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo')
    with TestClient(create_app('sqlite:///'+(tmp_path/'brand.db').as_posix(),seed_demo=False)) as client:
        assert client.get('/openapi.json').json()['info']['title']=='英霏特项目管理'
