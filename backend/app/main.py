import hashlib
import hmac
import os
import re
import secrets
import time
from decimal import Decimal, InvalidOperation
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
from .models import ENTITIES, Activity, Category, CustomField, EntityMeta, Job, JobRun, Product, Project, ProjectSchedule, ProjectSource, ProjectProfile, TaskContent, Report, SessionToken, serialize
from .schemas import SCHEMAS, CategoryIn, CustomFieldIn, EntityMetaIn, LoginIn, ReportIn, ProjectProfileIn, date_value, month_value
from .native_projects import register_project_routes, profile_values, ensure_profile, add_update, project_start_date, save_project_start_date
from .native_project_migration import migrate_native_projects
from .seed import seed
from .services import claim_job, dashboard, execute_run, local_today, log, stamp, utcnow
from .market import register_market_routes, ensure_sources
from .project_files import register_file_routes


COOKIE = "product_hub_session"


DEFAULT_CATEGORIES = (
    ("project-battery", "project", "电池类", 10),
    ("project-dry-burn", "project", "干烧类", 20),
    ("project-accessory", "project", "配件类", 30),
    ("report-market", "report", "市场类型报告", 10),
    ("report-research", "report", "研发类型报告", 20),
    ("report-product", "report", "产品类型报告", 30),
)


def seed_classifications(session, demo=False):
    for identifier, scope, name, order in DEFAULT_CATEGORIES:
        if not session.get(Category, identifier) and not session.scalar(select(Category).where(Category.scope == scope, Category.name == name)):
            session.add(Category(id=identifier, scope=scope, name=name, active=True, sort_order=order))
    session.flush()
    if demo:
        samples = {"demo-project-1": "project-battery", "demo-project-2": "project-accessory",
                   "demo-project-3": "project-dry-burn", "demo-project-4": "project-accessory",
                   "demo-project-5": "project-battery"}
        for project_id, category_id in samples.items():
            if session.get(Project, project_id) and not session.get(EntityMeta, ("project", project_id)):
                session.add(EntityMeta(scope="project", entity_id=project_id, category_id=category_id, values={}, updated_at=stamp()))
        for report in session.scalars(select(Report)):
            if not session.get(EntityMeta, ("report", report.id)):
                category_id = "report-market" if "竞品" in report.title else "report-product"
                session.add(EntityMeta(scope="report", entity_id=report.id, category_id=category_id, values={}, updated_at=stamp()))
    session.commit()


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
        with factory() as session:
            try:
                seed_classifications(session, demo=mode == "demo" and seed_demo)
            except IntegrityError:
                session.rollback()  # Another initializer inserted the same defaults first.
        with factory() as session, session.begin():
            ensure_sources(session)
            migrate_native_projects(session)
            for project in session.scalars(select(Project)):
                if not session.get(ProjectProfile, project.id):
                    ensure_profile(session, project.id).progress_known = True
        yield
        engine.dispose()

    app = FastAPI(title="英霏特", version="0.1.0", lifespan=lifespan)
    app.state.Session = factory
    app.state.engine = engine
    app.state.mode = mode
    register_project_routes(app, factory)
    register_file_routes(app,factory)
    register_market_routes(app, factory)
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"] if mode == "demo" else [], allow_credentials=True, allow_methods=["GET", "POST", "PATCH", "PUT", "OPTIONS"], allow_headers=["Content-Type"])
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
        return {"status": "ok", "mode": mode, "workspace_kind": getattr(app.state, "workspace_kind", "")}

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
            profiles = {row.project_id: row for row in session.scalars(select(ProjectProfile))}
            schedules = {row.project_id: row.start_date for row in session.scalars(select(ProjectSchedule))}
            for project in result["projects"]:
                project["profile"] = profile_values(profiles.get(project['id']))
                project['start_date'] = schedules.get(project['id'], '')
            contents = {row.task_id: row.description for row in session.scalars(select(TaskContent))}
            for task in result['tasks']:
                task['description'] = contents.get(task['id'], '')
            result["reports"] = [serialize(row) for row in session.scalars(select(Report).order_by(Report.generated_at.desc()))]
            result["categories"] = [serialize(row) for row in session.scalars(select(Category).order_by(Category.scope, Category.sort_order, Category.name))]
            result["custom_fields"] = [serialize(row) for row in session.scalars(select(CustomField).order_by(CustomField.scope, CustomField.sort_order, CustomField.label))]
            result["entity_meta"] = [serialize(row) for row in session.scalars(select(EntityMeta))]
            result["activity"] = [serialize(row) for row in session.scalars(select(Activity).order_by(Activity.created_at.desc()).limit(50))]
            return result

    @app.get("/api/project-sources/{project_id}")
    def project_source(project_id: str):
        with factory() as session:
            source = session.get(ProjectSource, project_id)
            if not source:
                raise HTTPException(404, "项目没有 Excel 来源记录")
            return {**source.payload, "progress_known": source.progress_known}

    @app.get("/api/project-assets/{filename}")
    def project_asset(filename: str):
        if not re.fullmatch(r"[a-f0-9]{64}\.(png|jpg|jpeg|gif|webp)", filename):
            raise HTTPException(404, "图片不存在")
        root = Path(os.getenv("PROJECT_ASSETS", str(Path(__file__).resolve().parents[1] / "import-assets"))).resolve()
        target = (root / filename).resolve()
        if not target.is_relative_to(root) or not target.is_file():
            raise HTTPException(404, "图片不存在")
        return FileResponse(target, headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})

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
        if name == "knowledge_documents" and data.get("project_id") and not session.get(Project, data["project_id"]):
            raise HTTPException(422, "关联项目不存在")

    def add_routes(name, model, schema):
        def create(payload: dict):
            try:
                values = schema.model_validate(payload).model_dump()
            except ValidationError as error:
                raise HTTPException(422, jsonable_encoder(error.errors(), custom_encoder={ValueError: str}))
            with factory() as session:
                validate_references(session, name, values)
                nested_profile = values.pop('profile', None) if name == 'projects' else None
                start_date = values.pop('start_date') if name == 'projects' else None
                task_description = values.pop('description') if name == 'tasks' else None
                row = model(**values)
                if name == "knowledge_documents":
                    row.updated_at = stamp()
                session.add(row)
                if name in ('projects', 'tasks'):
                    session.flush()
                if name == 'projects':
                    save_project_start_date(session,row.id,start_date)
                    profile = ensure_profile(session, row.id)
                    for key, value in (nested_profile or {}).items():
                        setattr(profile, key, value)
                    profile.progress_known = 'progress' in payload
                    add_update(session, row.id, '新建项目')
                if name == 'tasks':
                    session.add(TaskContent(task_id=row.id, description=task_description or ''))
                    add_update(session, row.project_id, f'新增任务：{row.title}')
                log(session, f"新增 {name}：{values.get('name', values.get('title', values.get('month', '记录')))}")
                try:
                    session.commit()
                except IntegrityError:
                    session.rollback()
                    raise HTTPException(409, "记录冲突：SKU 或产品、月份、渠道组合已存在")
                return {**serialize(row),'start_date':project_start_date(session,row.id)} if name=='projects' else serialize(row)

        def patch(row_id: str, payload: dict):
            with factory() as session:
                row = session.get(model, row_id)
                if not row:
                    raise HTTPException(404, "记录不存在")
                current = {field: getattr(row, field) for field in schema.model_fields if field not in (('profile','start_date') if name == 'projects' else ('description',) if name == 'tasks' else ())}
                if name == 'projects':
                    current['start_date'] = project_start_date(session,row_id)
                    profile = ensure_profile(session, row_id)
                    current['profile'] = {key: getattr(profile, key) for key in ProjectProfileIn.model_fields}
                    if isinstance(payload.get('profile'), dict):
                        payload = {**payload, 'profile': {**current['profile'], **payload['profile']}}
                if name == 'tasks':
                    content = session.get(TaskContent, row_id)
                    current['description'] = content.description if content else ''
                try:
                    values = schema.model_validate({**current, **payload}).model_dump()
                except ValidationError as error:
                    raise HTTPException(422, jsonable_encoder(error.errors(), custom_encoder={ValueError: str}))
                validate_references(session, name, values)
                nested_profile = values.pop('profile', None) if name == 'projects' else None
                start_date = values.pop('start_date') if name == 'projects' else None
                task_description = values.pop('description') if name == 'tasks' else None
                for key, value in values.items():
                    setattr(row, key, value)
                if name == 'projects':
                    if 'start_date' in payload:
                        save_project_start_date(session,row_id,start_date)
                    for key, value in (nested_profile or {}).items():
                        setattr(profile, key, value)
                    if 'progress' in payload:
                        profile.progress_known = True
                    add_update(session, row_id, f'更新项目：{row.stage} · {row.status}')
                if name == 'tasks':
                    if not content:
                        content = TaskContent(task_id=row_id)
                        session.add(content)
                    content.description = task_description
                    add_update(session, row.project_id, f'更新任务：{row.title} · {row.status}')
                if name == "projects" and "progress" in payload:
                    source = session.get(ProjectSource, row_id)
                    if source:
                        source.progress_known = True
                if name == "knowledge_documents":
                    row.updated_at = stamp()
                log(session, f"更新 {name}：{values.get('name', values.get('title', row_id))}")
                try:
                    session.commit()
                except IntegrityError:
                    session.rollback()
                    raise HTTPException(409, "记录冲突：SKU 或产品、月份、渠道组合已存在")
                return {**serialize(row),'start_date':project_start_date(session,row_id)} if name=='projects' else serialize(row)
        app.add_api_route(f"/api/{name}", create, methods=["POST"], status_code=201, name=f"create_{name}")
        app.add_api_route(f"/api/{name}/{{row_id}}", patch, methods=["PATCH"], name=f"patch_{name}")

    for name, model in ENTITIES.items():
        add_routes(name, model, SCHEMAS[name])

    @app.get("/api/categories")
    def list_categories(scope: str | None = None):
        if scope is not None and scope not in ("project", "report"):
            raise HTTPException(422, "范围应为 project 或 report")
        with factory() as session:
            statement = select(Category).order_by(Category.scope, Category.sort_order, Category.name)
            if scope:
                statement = statement.where(Category.scope == scope)
            return [serialize(row) for row in session.scalars(statement)]

    @app.get("/api/custom-fields")
    def list_custom_fields(scope: str | None = None):
        if scope is not None and scope not in ("project", "report"):
            raise HTTPException(422, "范围应为 project 或 report")
        with factory() as session:
            statement = select(CustomField).order_by(CustomField.scope, CustomField.sort_order, CustomField.label)
            if scope:
                statement = statement.where(CustomField.scope == scope)
            return [serialize(row) for row in session.scalars(statement)]

    @app.post("/api/categories", status_code=201)
    def create_category(payload: CategoryIn):
        with factory() as session:
            row = Category(**payload.model_dump())
            session.add(row)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                raise HTTPException(409, "该范围内的分类名称已存在")
            return serialize(row)

    @app.patch("/api/categories/{category_id}")
    def update_category(category_id: str, payload: dict):
        with factory() as session:
            row = session.get(Category, category_id)
            if not row:
                raise HTTPException(404, "分类不存在")
            if "scope" in payload and payload["scope"] != row.scope:
                raise HTTPException(422, "分类所属范围不可修改")
            try:
                current = {key: getattr(row, key) for key in CategoryIn.model_fields}
                values = CategoryIn.model_validate({**current, **payload}).model_dump()
            except ValidationError as error:
                raise HTTPException(422, jsonable_encoder(error.errors(), custom_encoder={ValueError: str}))
            for key, value in values.items():
                setattr(row, key, value)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                raise HTTPException(409, "该范围内的分类名称已存在")
            return serialize(row)

    def check_field(values):
        if values["kind"] == "select":
            if not values["options"] or len(set(values["options"])) != len(values["options"]):
                raise HTTPException(422, "选项字段需要不重复的候选值")
        else:
            values["options"] = []
        return values

    @app.post("/api/custom-fields", status_code=201)
    def create_custom_field(payload: CustomFieldIn):
        values = check_field(payload.model_dump())
        with factory() as session:
            row = CustomField(**values)
            session.add(row)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                raise HTTPException(409, "该范围内的字段标识已存在")
            return serialize(row)

    @app.patch("/api/custom-fields/{field_id}")
    def update_custom_field(field_id: str, payload: dict):
        with factory() as session:
            row = session.get(CustomField, field_id)
            if not row:
                raise HTTPException(404, "自定义字段不存在")
            if ("scope" in payload and payload["scope"] != row.scope) or ("key" in payload and payload["key"] != row.key):
                raise HTTPException(422, "字段范围和标识不可修改")
            try:
                current = {key: getattr(row, key) for key in CustomFieldIn.model_fields}
                values = check_field(CustomFieldIn.model_validate({**current, **payload}).model_dump())
            except ValidationError as error:
                raise HTTPException(422, jsonable_encoder(error.errors(), custom_encoder={ValueError: str}))
            for key, value in values.items():
                setattr(row, key, value)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                raise HTTPException(409, "该范围内的字段标识已存在")
            return serialize(row)

    @app.get("/api/entity-meta/{scope}/{entity_id}")
    def get_entity_meta(scope: str, entity_id: str):
        if scope not in ("project", "report"):
            raise HTTPException(422, "范围应为 project 或 report")
        with factory() as session:
            model = Project if scope == "project" else Report
            if not session.get(model, entity_id):
                raise HTTPException(404, "关联记录不存在")
            row = session.get(EntityMeta, (scope, entity_id))
            return serialize(row) if row else {"scope": scope, "entity_id": entity_id, "category_id": "", "values": {}, "updated_at": ""}

    @app.put("/api/entity-meta/{scope}/{entity_id}")
    def save_entity_meta(scope: str, entity_id: str, payload: EntityMetaIn):
        if scope not in ("project", "report"):
            raise HTTPException(422, "范围应为 project 或 report")
        with factory() as session:
            model = Project if scope == "project" else Report
            if not session.get(model, entity_id):
                raise HTTPException(404, "关联记录不存在")
            if payload.category_id:
                category = session.get(Category, payload.category_id)
                if not category or category.scope != scope:
                    raise HTTPException(422, "分类不属于当前范围")
            definitions = {field.key: field for field in session.scalars(select(CustomField).where(CustomField.scope == scope))}
            for key, value in payload.values.items():
                field = definitions.get(key)
                if not field:
                    raise HTTPException(422, f"未知自定义字段：{key}")
                if field.kind == "number" and value:
                    try:
                        number = Decimal(value)
                    except InvalidOperation:
                        raise HTTPException(422, f"{field.label}应为数字")
                    if not number.is_finite():
                        raise HTTPException(422, f"{field.label}应为有限数字")
                if field.kind == "date" and value:
                    try:
                        date_value(value)
                    except ValueError:
                        raise HTTPException(422, f"{field.label}应为有效日期")
                if field.kind == "select" and value and value not in field.options:
                    raise HTTPException(422, f"{field.label}不在候选值内")
            for field in definitions.values():
                if field.active and field.required and not payload.values.get(field.key, "").strip():
                    raise HTTPException(422, f"请填写{field.label}")
            row = session.get(EntityMeta, (scope, entity_id))
            if not row:
                row = EntityMeta(scope=scope, entity_id=entity_id)
                session.add(row)
            row.category_id = payload.category_id
            row.values = payload.values
            row.updated_at = stamp()
            session.commit()
            return serialize(row)

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
