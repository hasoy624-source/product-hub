import hashlib
import hmac
import os
import secrets
import time
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse
from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from .database import database, initialize
from .models import ENTITIES, Activity, Job, JobRun, Product, Project, Report, SessionToken, serialize
from .schemas import SCHEMAS, LoginIn, ReportIn, month_value
from .seed import seed
from .services import claim_job, dashboard, execute_run, local_today, log, stamp, utcnow


COOKIE = "product_hub_session"


def settings():
    mode = os.getenv("APP_MODE", "demo")
    if mode not in ("demo", "production"):
        raise RuntimeError("APP_MODE 必须为 demo 或 production")
    username, password = os.getenv("ADMIN_USERNAME", ""), os.getenv("ADMIN_PASSWORD", "")
    if mode == "production" and (not username.strip() or not password.strip()):
        raise RuntimeError("production 模式必须配置 ADMIN_USERNAME 和 ADMIN_PASSWORD")
    if mode == "production":
        if len(password) < 12 or password.lower().startswith(("replace_", "changeme", "change_me", "your_password")):
            raise RuntimeError("ADMIN_PASSWORD 必须为至少 12 字符的非模板密码")
        origin = os.getenv("PUBLIC_ORIGIN", "")
        parsed = urlparse(origin)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
            raise RuntimeError("production 模式必须配置有效的 https PUBLIC_ORIGIN，不含路径、查询或凭据")
    return mode, username, password


def create_app(database_url=None, seed_demo=True):
    mode, username, password = settings()
    engine, factory = database(database_url)

    @asynccontextmanager
    async def lifespan(app):
        initialize(engine)
        if mode == "demo" and seed_demo:
            with factory() as session:
                try:
                    seed(session)
                except IntegrityError:
                    session.rollback()  # Concurrent demo initializers are harmless.
        yield
        engine.dispose()

    app = FastAPI(title="Product Hub · 产品运营工作台", version="0.1.0", lifespan=lifespan)
    app.state.Session = factory
    app.state.engine = engine
    app.state.mode = mode
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"] if mode == "demo" else [], allow_credentials=True, allow_methods=["GET", "POST", "PATCH", "OPTIONS"], allow_headers=["Content-Type"])
    attempts = {}

    @app.middleware("http")
    async def security(request, call_next):
        if mode == "production" and request.url.path.startswith("/api/"):
            if request.method not in ("GET", "HEAD", "OPTIONS"):
                origin = request.headers.get("origin", "").rstrip("/")
                expected = os.getenv("PUBLIC_ORIGIN", str(request.base_url).rstrip("/")).rstrip("/")
                if not origin or origin != expected:
                    return JSONResponse(status_code=403, content={"detail": "请求来源与系统地址不一致"})
            public = request.url.path in ("/api/health", "/api/auth/login")
            if not public and request.method != "OPTIONS":
                raw = request.cookies.get(COOKIE, "")
                token_hash = hashlib.sha256(raw.encode()).hexdigest()
                with factory() as session:
                    record = session.get(SessionToken, token_hash)
                    if not record or record.expires_at <= stamp():
                        return JSONResponse(status_code=401, content={"detail": "请先登录"})
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health():
        return {"status": "ok", "mode": mode}

    @app.post("/api/auth/login")
    def login(payload: LoginIn, request: Request):
        if mode == "demo":
            return {"authenticated": True, "username": "演示管理员", "mode": mode}
        address = request.client.host if request.client else "unknown"
        now = time.monotonic()
        history = [value for value in attempts.get(address, []) if now - value < 300]
        attempts[address] = history
        if len(history) >= 10:
            raise HTTPException(429, "登录尝试过于频繁，请 5 分钟后重试")
        if not (hmac.compare_digest(payload.username.encode(), username.encode()) and hmac.compare_digest(payload.password.encode(), password.encode())):
            history.append(now)
            raise HTTPException(401, "用户名或密码不正确")
        attempts.pop(address, None)
        token = secrets.token_urlsafe(48)
        with factory() as session:
            session.execute(delete(SessionToken).where(SessionToken.expires_at <= stamp()))
            old = request.cookies.get(COOKIE)
            if old:
                session.execute(delete(SessionToken).where(SessionToken.token_hash == hashlib.sha256(old.encode()).hexdigest()))
            session.add(SessionToken(token_hash=hashlib.sha256(token.encode()).hexdigest(), expires_at=stamp(utcnow()+timedelta(hours=8))))
            session.commit()
        response = JSONResponse({"authenticated": True, "username": username, "mode": mode})
        response.set_cookie(COOKIE, token, httponly=True, secure=True, samesite="strict", max_age=8*3600, path="/")
        return response

    @app.post("/api/auth/logout")
    def logout(request: Request):
        raw = request.cookies.get(COOKIE, "")
        with factory() as session:
            session.execute(delete(SessionToken).where(SessionToken.token_hash == hashlib.sha256(raw.encode()).hexdigest()))
            session.commit()
        response = JSONResponse({"authenticated": False})
        response.delete_cookie(COOKIE, path="/", httponly=True, secure=mode == "production", samesite="strict")
        return response

    @app.get("/api/workspace")
    def workspace():
        with factory() as session:
            result = {name: [serialize(row) for row in session.scalars(select(model))] for name, model in ENTITIES.items()}
            result["reports"] = [serialize(row) for row in session.scalars(select(Report).order_by(Report.generated_at.desc()))]
            result["activity"] = [serialize(row) for row in session.scalars(select(Activity).order_by(Activity.created_at.desc()).limit(50))]
            return result

    @app.get("/api/dashboard")
    def get_dashboard(month: str | None = None):
        try:
            selected = month_value(month or local_today().strftime("%Y-%m"))
        except ValueError as error:
            raise HTTPException(422, str(error))
        with factory() as session:
            return dashboard(session, selected)

    def validate_references(session, name, data):
        if name in ("sales", "projects") and data.get("product_id") and not session.get(Product, data["product_id"]):
            raise HTTPException(422, "关联产品不存在")
        if name == "tasks" and not session.get(Project, data["project_id"]):
            raise HTTPException(422, "关联项目不存在")

    def add_routes(name, model, schema):
        def create(payload: dict):
            try:
                values = schema.model_validate(payload).model_dump()
            except ValidationError as error:
                raise HTTPException(422, jsonable_encoder(error.errors(), custom_encoder={ValueError: str}))
            with factory() as session:
                validate_references(session, name, values)
                row = model(**values)
                session.add(row)
                log(session, f"新增 {name}：{values.get('name', values.get('title', values.get('month', '记录')))}")
                try:
                    session.commit()
                except IntegrityError:
                    session.rollback()
                    raise HTTPException(409, "记录冲突：SKU 或产品、月份、渠道组合已存在")
                return serialize(row)

        def patch(row_id: str, payload: dict):
            with factory() as session:
                row = session.get(model, row_id)
                if not row:
                    raise HTTPException(404, "记录不存在")
                current = {field: getattr(row, field) for field in schema.model_fields}
                try:
                    values = schema.model_validate({**current, **payload}).model_dump()
                except ValidationError as error:
                    raise HTTPException(422, jsonable_encoder(error.errors(), custom_encoder={ValueError: str}))
                validate_references(session, name, values)
                for key, value in values.items():
                    setattr(row, key, value)
                log(session, f"更新 {name}：{values.get('name', values.get('title', row_id))}")
                try:
                    session.commit()
                except IntegrityError:
                    session.rollback()
                    raise HTTPException(409, "记录冲突：SKU 或产品、月份、渠道组合已存在")
                return serialize(row)
        app.add_api_route(f"/api/{name}", create, methods=["POST"], status_code=201, name=f"create_{name}")
        app.add_api_route(f"/api/{name}/{{row_id}}", patch, methods=["PATCH"], name=f"patch_{name}")

    for name, model in ENTITIES.items():
        add_routes(name, model, SCHEMAS[name])

    @app.post("/api/reports/generate", status_code=201)
    def report(payload: ReportIn):
        from .services import generate_report
        with factory() as session:
            try:
                result = generate_report(session, payload.month, payload.job_id)
            except ValueError as error:
                raise HTTPException(422, str(error))
            session.commit()
            return serialize(result)

    @app.post("/api/jobs/{job_id}/run")
    def run_job(job_id: str):
        with factory() as session:
            if not session.get(Job, job_id):
                raise HTTPException(404, "定时任务不存在")
        run_id = claim_job(factory, job_id, manual=True)
        if not run_id:
            raise HTTPException(409, "任务正被其他执行器处理，请稍后重试")
        try:
            result = execute_run(factory, run_id, local_today().strftime("%Y-%m"))
        except Exception:
            raise HTTPException(500, "报告生成失败，已记录执行日志")
        return serialize(result)

    @app.get("/api/jobs/{job_id}/runs")
    def job_runs(job_id: str):
        with factory() as session:
            if not session.get(Job, job_id):
                raise HTTPException(404, "定时任务不存在")
            return [serialize(row) for row in session.scalars(select(JobRun).where(JobRun.job_id == job_id).order_by(JobRun.started_at.desc()).limit(100))]

    dist = Path(os.getenv("FRONTEND_DIST", str(Path(__file__).resolve().parents[2] / "frontend" / "dist"))).resolve()
    if (dist / "index.html").is_file():
        @app.get("/{path:path}", include_in_schema=False)
        def frontend(path: str):
            if path == "api" or path.startswith("api/"):
                raise HTTPException(404, "接口不存在")
            target = (dist / path).resolve()
            if not target.is_relative_to(dist):
                raise HTTPException(404, "文件不存在")
            return FileResponse(target if target.is_file() else dist / "index.html")
    return app


app = create_app()
