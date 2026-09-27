import pytest
from fastapi.testclient import TestClient
from app.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_MODE", "demo")
    with TestClient(create_app(f"sqlite:///{(tmp_path / 'classes.db').as_posix()}", seed_demo=False)) as browser:
        yield browser


def test_default_categories_and_management(client):
    workspace = client.get("/api/workspace").json()
    assert [(item["scope"], item["name"]) for item in workspace["categories"]] == [
        ("project", "电池类"), ("project", "干烧类"), ("project", "配件类"),
        ("report", "市场类型报告"), ("report", "研发类型报告"), ("report", "产品类型报告")]
    assert workspace["custom_fields"] == workspace["entity_meta"] == []
    assert len(client.get("/api/categories?scope=project").json()) == 3
    assert client.get("/api/categories?scope=other").status_code == 422
    created = client.post("/api/categories", json={"scope": "project", "name": "加热类", "sort_order": 40})
    assert created.status_code == 201, created.text
    assert client.post("/api/categories", json={"scope": "project", "name": "加热类"}).status_code == 409
    changed = client.patch(f"/api/categories/{created.json()['id']}", json={"name": "温控类", "active": False})
    assert changed.status_code == 200 and changed.json()["name"] == "温控类" and not changed.json()["active"]
    assert client.patch(f"/api/categories/{created.json()['id']}", json={"scope": "report"}).status_code == 422


def test_custom_fields_validate_values_and_scope(client):
    project = client.post("/api/projects", json={"name": "电池研发", "owner": "甲", "due_date": "2026-12-01"}).json()
    field = client.post("/api/custom-fields", json={"scope": "project", "key": "priority", "label": "优先级", "kind": "select", "options": ["高", "中", "低"], "required": True})
    assert field.status_code == 201, field.text
    assert len(client.get("/api/custom-fields?scope=project").json()) == 1
    assert client.post("/api/custom-fields", json={"scope": "project", "key": "priority", "label": "重复"}).status_code == 409
    assert client.post("/api/custom-fields", json={"scope": "project", "key": "bad", "label": "错误", "kind": "select", "options": []}).status_code == 422
    endpoint = f"/api/entity-meta/project/{project['id']}"
    assert client.put(endpoint, json={"category_id": "report-market", "values": {"priority": "高"}}).status_code == 422
    assert client.put(endpoint, json={"category_id": "project-battery", "values": {}}).status_code == 422
    assert client.put(endpoint, json={"category_id": "project-battery", "values": {"priority": "未知"}}).status_code == 422
    saved = client.put(endpoint, json={"category_id": "project-battery", "values": {"priority": "高"}})
    assert saved.status_code == 200, saved.text
    assert saved.json()["values"] == {"priority": "高"}
    assert client.get(endpoint).json()["values"] == {"priority": "高"}
    assert client.get("/api/workspace").json()["entity_meta"][0]["category_id"] == "project-battery"
    assert client.patch(f"/api/custom-fields/{field.json()['id']}", json={"key": "changed"}).status_code == 422
    changed = client.patch(f"/api/custom-fields/{field.json()['id']}", json={"label": "处理优先级", "active": False})
    assert changed.status_code == 200 and not changed.json()["active"]
    assert client.put(endpoint, json={"category_id": "project-battery", "values": {"priority": "中"}}).status_code == 200


def test_report_type_metadata(client):
    report = client.post("/api/reports/generate", json={"month": "2026-09"})
    assert report.status_code == 201, report.text
    field = client.post("/api/custom-fields", json={"scope": "report", "key": "review_owner", "label": "复盘负责人", "kind": "text"})
    assert field.status_code == 201
    response = client.put(f"/api/entity-meta/report/{report.json()['id']}", json={"category_id": "report-market", "values": {"review_owner": "产品经理"}})
    assert response.status_code == 200, response.text
    assert response.json()["scope"] == "report"
    assert response.json()["category_id"] == "report-market"
    assert response.json()["values"]["review_owner"] == "产品经理"
