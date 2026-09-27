from datetime import date, datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import COOKIE, create_app
from app.models import Job, JobRun, Report, SessionToken
from app.services import claim_job, dashboard, execute_run, local_today, next_occurrence, stamp, tick


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_MODE", "demo")
    app = create_app(f"sqlite:///{(tmp_path / 'test.db').as_posix()}", seed_demo=False)
    with TestClient(app) as browser:
        yield browser


def product(client, sku="SKU-A"):
    response = client.post("/api/products", json={"name": "测试颈枕", "sku": sku, "category": "智能健康", "owner": "负责人"})
    assert response.status_code == 201, response.text
    return response.json()


def project(client, product_id=""):
    response = client.post("/api/projects", json={"name": "测试研发", "product_id": product_id, "owner": "负责人", "due_date": "2026-12-01"})
    assert response.status_code == 201, response.text
    return response.json()


def job(client, enabled=True, frequency="monthly"):
    response = client.post("/api/jobs", json={"name": "自动月报", "frequency": frequency, "enabled": enabled, "next_run_at": "2026-09-01T09:00:00+08:00"})
    assert response.status_code == 201, response.text
    return response.json()


def test_empty_dashboard(client):
    result = client.get("/api/dashboard?month=2026-09").json()
    assert result["revenue_cents"] == result["previous_revenue_cents"] == 0
    assert result["growth_pct"] is None
    assert result["top_product_share"] == 0
    assert [row["month"] for row in result["trend"]] == ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]


def test_dashboard_calculation_and_zero_prior(client):
    a, b = product(client), product(client, "SKU-B")
    for product_id, month, amount in [(a["id"], "2026-08", 10000), (a["id"], "2026-09", 18000), (b["id"], "2026-09", 2000)]:
        assert client.post("/api/sales", json={"product_id": product_id, "month": month, "revenue_cents": amount}).status_code == 201
    result = client.get("/api/dashboard?month=2026-09").json()
    assert result["revenue_cents"] == 20000
    assert result["previous_revenue_cents"] == 10000
    assert result["growth_pct"] == 100
    assert result["top_product_share"] == 90
    assert result["category_sales"] == [{"category": "智能健康", "revenue_cents": 20000, "share": 100}]
    assert client.get("/api/dashboard?month=2026-08").json()["growth_pct"] is None
    assert client.get("/api/dashboard?month=2027-01").json()["trend"][0]["month"] == "2026-08"


@pytest.mark.parametrize("changes", [{"revenue_cents": -1}, {"units": -1}, {"revenue_cents": 10.5}, {"revenue_cents": True}, {"month": "2026-13"}, {"product_id": "missing"}, {"month": "2026-9"}])
def test_sales_reject_invalid(client, changes):
    p = product(client)
    payload = {"product_id": p["id"], "month": "2026-09", "revenue_cents": 100, **changes}
    assert client.post("/api/sales", json=payload).status_code == 422


def test_unique_sale_patch_and_persistence(client):
    p = product(client)
    payload = {"product_id": p["id"], "month": "2026-09", "revenue_cents": 100}
    sale = client.post("/api/sales", json=payload).json()
    assert client.post("/api/sales", json=payload).status_code == 409
    assert client.patch(f"/api/sales/{sale['id']}", json={"revenue_cents": 250}).json()["revenue_cents"] == 250
    assert client.get("/api/workspace").json()["sales"][0]["revenue_cents"] == 250
    assert client.patch(f"/api/sales/{sale['id']}", json={"id": "different"}).status_code == 422
    assert client.patch("/api/sales/missing", json={"units": 5}).status_code == 404


def test_crud_all_entities(client):
    p = product(client)
    assert client.patch(f"/api/products/{p['id']}", json={"status": "研发中"}).json()["status"] == "研发中"
    pr = project(client, p["id"])
    assert client.patch(f"/api/projects/{pr['id']}", json={"stage": "DVT", "progress": 75}).json()["progress"] == 75
    task = client.post("/api/tasks", json={"project_id": pr["id"], "title": "试验", "owner": "研发", "due_date": "2026-10-01"}).json()
    assert client.patch(f"/api/tasks/{task['id']}", json={"status": "已完成"}).json()["status"] == "已完成"
    signal = client.post("/api/signals", json={"kind": "竞品动态", "brand": "虚构", "title": "更新", "content": "例子", "occurred_on": "2026-09-20"}).json()
    assert client.patch(f"/api/signals/{signal['id']}", json={"sentiment": "正向"}).json()["sentiment"] == "正向"
    seat = client.post("/api/seats", json={"name": "占位", "kind": "AI 总结", "provider": "未接入"}).json()
    assert client.patch(f"/api/seats/{seat['id']}", json={"status": "已停用"}).json()["status"] == "已停用"
    j = job(client)
    assert client.patch(f"/api/jobs/{j['id']}", json={"enabled": False}).json()["enabled"] is False


@pytest.mark.parametrize("path,payload", [
    ("projects", {"name": "x", "owner": "y", "due_date": "2026-02-30"}),
    ("projects", {"name": "x", "owner": "y", "due_date": "2026-02-28", "stage": "TEST"}),
    ("projects", {"name": "x", "owner": "y", "due_date": "2026-02-28", "product_id": "missing"}),
    ("tasks", {"project_id": "missing", "title": "x", "owner": "y", "due_date": "2026-02-28"}),
    ("jobs", {"name": "x", "next_run_at": "2026-10-01T08:00:00"}),
    ("signals", {"kind": "竞品动态", "brand": "b", "title": "t", "content": "c", "occurred_on": "2026-09-01", "source_url": "javascript:alert(1)"}),
    ("seats", {"name": "x", "kind": "AI 总结", "provider": "p", "status": "已接入"}),
])
def test_validation(client, path, payload):
    assert client.post(f"/api/{path}", json=payload).status_code == 422


def test_dashboard_overdue(client):
    pr = project(client)
    for status in ["待办", "进行中", "已完成"]:
        client.post("/api/tasks", json={"project_id": pr["id"], "title": "任务", "owner": "研发", "due_date": "2026-09-20", "status": status})
    with client.app.state.Session() as session:
        result = dashboard(session, "2026-09", today=date(2026, 9, 21))
        assert result["overdue_tasks"] == 2
        assert result["active_projects"] == 1


def test_report_rule_summary_filters_month(client):
    for month in ["2026-08", "2026-09"]:
        client.post("/api/signals", json={"kind": "竞品动态", "brand": "虚构品牌", "title": f"事件{month}", "content": "本地录入", "occurred_on": f"{month}-20"})
    result = client.post("/api/reports/generate", json={"month": "2026-09"})
    assert result.status_code == 201
    assert result.json()["source"] == "规则汇总"
    assert "事件2026-09" in result.json()["content"]
    assert "事件2026-08" not in result.json()["content"]
    assert "未调用 AI" in result.json()["content"]
    assert client.post("/api/reports/generate", json={"month": "2026-09", "job_id": "missing"}).status_code == 422


def test_scheduler_idempotent_pause_and_manual(client):
    active, paused = job(client), job(client, False)
    factory = client.app.state.Session
    now = datetime(2026, 9, 27, tzinfo=timezone.utc)
    assert len(tick(factory, now)) == 1
    assert tick(factory, now) == []
    runs = client.get(f"/api/jobs/{active['id']}/runs").json()
    assert len(runs) == 1 and runs[0]["status"] == "succeeded"
    assert client.get(f"/api/jobs/{paused['id']}/runs").json() == []
    manual = client.post(f"/api/jobs/{paused['id']}/run", json={})
    assert manual.status_code == 200
    assert manual.json()["month"] == local_today().strftime("%Y-%m")
    with factory() as session:
        assert session.get(Job, paused["id"]).last_run_at
        assert session.get(Job, paused["id"]).enabled is False


def test_concurrent_worker_claim(client):
    j = job(client)
    now = datetime(2026, 9, 27, tzinfo=timezone.utc)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: claim_job(client.app.state.Session, j["id"], now), range(2)))
    assert sum(value is not None for value in results) == 1


def test_failed_run_record_and_manual_recovery(client, monkeypatch):
    from app import services
    j = job(client)
    original = services.generate_report
    def broken(*args, **kwargs):
        raise RuntimeError("injected failure")
    monkeypatch.setattr(services, "generate_report", broken)
    run_id = claim_job(client.app.state.Session, j["id"], datetime(2026, 9, 27, tzinfo=timezone.utc))
    with pytest.raises(RuntimeError):
        execute_run(client.app.state.Session, run_id)
    records = client.get(f"/api/jobs/{j['id']}/runs").json()
    assert records[0]["status"] == "failed" and "injected failure" in records[0]["error"]
    monkeypatch.setattr(services, "generate_report", original)
    assert client.post(f"/api/jobs/{j['id']}/run", json={}).status_code == 200
    assert {run["status"] for run in client.get(f"/api/jobs/{j['id']}/runs").json()} == {"succeeded", "failed"}


def test_shanghai_monthly_schedule():
    anchor = "2026-09-30T17:00:00+00:00"  # Oct 1, 01:00 Asia/Shanghai
    now = datetime.fromisoformat(anchor)
    assert next_occurrence("monthly", anchor, now) == "2026-10-31T17:00:00+00:00"


def test_production_requires_configuration(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_MODE", "production")
    monkeypatch.delenv("ADMIN_USERNAME", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    with pytest.raises(RuntimeError, match="ADMIN_USERNAME"):
        create_app(f"sqlite:///{tmp_path / 'prod.db'}")


def test_production_cookie_csrf_logout_no_seed(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_MODE", "production")
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "long-test-password")
    monkeypatch.setenv("PUBLIC_ORIGIN", "https://testserver")
    app = create_app(f"sqlite:///{(tmp_path / 'prod.db').as_posix()}")
    with TestClient(app, base_url="https://testserver") as browser:
        assert browser.get("/api/health").status_code == 200
        assert browser.get("/api/workspace").status_code == 401
        credentials = {"username": "admin", "password": "long-test-password"}
        assert browser.post("/api/auth/login", json=credentials).status_code == 403
        assert browser.post("/api/auth/login", json=credentials, headers={"Origin": "https://evil.example"}).status_code == 403
        response = browser.post("/api/auth/login", json=credentials, headers={"Origin": "https://testserver"})
        assert response.status_code == 200
        cookie = response.headers["set-cookie"]
        assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=strict" in cookie
        assert browser.get("/api/workspace").json()["products"] == []
        with app.state.Session() as session:
            assert session.scalar(select(SessionToken)).token_hash != browser.cookies.get(COOKIE)
        assert browser.post("/api/auth/logout", headers={"Origin": "https://testserver"}).status_code == 200
        assert browser.get("/api/workspace").status_code == 401
        with app.state.Session() as session:
            assert session.scalar(select(SessionToken)) is None


def test_seed_is_demo_only_and_idempotent(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_MODE", "demo")
    app = create_app(f"sqlite:///{(tmp_path / 'demo.db').as_posix()}")
    with TestClient(app) as browser:
        first = browser.get("/api/workspace").json()
        assert len(first["products"]) == 5 and len(first["sales"]) == 18
        assert {row["stage"] for row in first["projects"]} == {"概念与启动", "设计与开发", "EVT", "DVT", "MP"}
        assert len({sale["month"] for sale in first["sales"]}) == 6
        assert "虚构" in first["products"][0]["description"]
    with TestClient(app) as browser:
        assert len(browser.get("/api/workspace").json()["sales"]) == 18


def test_static_frontend_and_api_404(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<h1>frontend test</h1>", encoding="utf-8")
    monkeypatch.setenv("FRONTEND_DIST", str(dist))
    monkeypatch.setenv("APP_MODE", "demo")
    app = create_app(f"sqlite:///{(tmp_path / 'static.db').as_posix()}", seed_demo=False)
    with TestClient(app) as browser:
        assert "frontend test" in browser.get("/").text
        assert "frontend test" in browser.get("/projects").text
        assert browser.get("/api/not-real").status_code == 404


@pytest.mark.parametrize("field", ["sku", "category", "owner"])
def test_database_length_alignment(client, field):
    values = {"name": "测试", "sku": "test", "category": "分类", "owner": "负责人", field: "长" * 101}
    assert client.post("/api/products", json=values).status_code == 422


@pytest.mark.parametrize("password,origin", [
    ("REPLACE_WITH_A_UNIQUE_LONG_PASSWORD", "https://testserver"),
    ("changemechangeme", "https://testserver"),
    ("long-test-password", "http://testserver"),
    ("long-test-password", "https://testserver/nested"),
    ("long-test-password", ""),
])
def test_production_rejects_placeholder_config(monkeypatch, tmp_path, password, origin):
    monkeypatch.setenv("APP_MODE", "production")
    monkeypatch.setenv("ADMIN_USERNAME", "admin")
    monkeypatch.setenv("ADMIN_PASSWORD", password)
    monkeypatch.setenv("PUBLIC_ORIGIN", origin)
    with pytest.raises(RuntimeError):
        create_app(f"sqlite:///{tmp_path / 'invalid.db'}")


def test_worker_module_executes_real_job(client, tmp_path):
    import os
    import subprocess
    import sys
    import time
    from pathlib import Path
    j = job(client)
    environment = {**os.environ, "APP_MODE": "demo", "WORKER_POLL_SECONDS": "1",
                   "DATABASE_URL": str(client.app.state.engine.url)}
    log_path = tmp_path / "worker.log"
    with log_path.open("w", encoding="utf-8") as output:
        process = subprocess.Popen([sys.executable, "-m", "app.worker"], cwd=Path(__file__).resolve().parents[1], env=environment, stdout=output, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 12
            found = False
            while time.monotonic() < deadline:
                with client.app.state.Session() as session:
                    run = session.scalar(select(JobRun).where(JobRun.job_id == j["id"]))
                    if run and run.status == "succeeded":
                        found = True
                        break
                time.sleep(0.1)
            assert found, log_path.read_text(encoding="utf-8")
        finally:
            process.terminate()
            process.wait(timeout=5)
    assert "Database scheduler started" in log_path.read_text(encoding="utf-8")


def test_month_end_clamps_and_continues():
    anchor = "2027-01-31T01:00:00+00:00"
    february = next_occurrence("monthly", anchor, datetime.fromisoformat(anchor))
    assert february == "2027-02-28T01:00:00+00:00"
    assert next_occurrence("monthly", february, datetime.fromisoformat(february)) == "2027-03-28T01:00:00+00:00"


@pytest.mark.parametrize("frequency,month_offset", [("monthly", -1), ("daily", 0), ("weekly", 0)])
def test_scheduled_report_month_by_frequency(client, frequency, month_offset):
    from app.services import shift_month
    j = job(client, frequency=frequency)
    run_id = claim_job(client.app.state.Session, j["id"], datetime(2026, 9, 27, tzinfo=timezone.utc))
    result = execute_run(client.app.state.Session, run_id)
    assert result.month == shift_month(local_today().strftime("%Y-%m"), month_offset)
