from fastapi.testclient import TestClient
from app.main import create_app


def test_knowledge_document_crud_and_project_scope(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_MODE", "demo")
    path = tmp_path / "knowledge.db"
    app = create_app(f"sqlite:///{path.as_posix()}", seed_demo=False)
    with TestClient(app) as client:
        project = client.post("/api/projects", json={"name": "样机研发", "owner": "负责人", "due_date": "2026-12-01"}).json()
        payload = {"project_id": project["id"], "template_id": "e-t1-test", "stage": "EVT", "title": "T1测试报告", "owner": "测试", "content": "# T1测试报告\n\n结果待填写"}
        created = client.post("/api/knowledge_documents", json=payload)
        assert created.status_code == 201, created.text
        row = created.json()
        assert row["updated_at"]
        assert row["status"] == "草稿"
        workspace = client.get("/api/workspace").json()
        assert workspace["knowledge_documents"] == [row]
        duplicate = client.post("/api/knowledge_documents", json=payload)
        assert duplicate.status_code == 409
        changed = client.patch(f"/api/knowledge_documents/{row['id']}", json={"status": "待评审", "content": "# T1测试报告\n\n测试通过"})
        assert changed.status_code == 200, changed.text
        assert changed.json()["content"].endswith("测试通过")
        assert changed.json()["status"] == "待评审"
        assert client.patch("/api/knowledge_documents/missing", json={"status": "已归档"}).status_code == 404
        assert client.post("/api/knowledge_documents", json={**payload, "template_id": "another", "project_id": "missing"}).status_code == 422
        assert client.post("/api/knowledge_documents", json={**payload, "template_id": "another", "stage": "unknown"}).status_code == 422
    with TestClient(create_app(f"sqlite:///{path.as_posix()}", seed_demo=False)) as client:
        assert client.get("/api/workspace").json()["knowledge_documents"][0]["content"].endswith("测试通过")
