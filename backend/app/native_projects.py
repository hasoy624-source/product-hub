"""Native project business records. Import provenance is not a runtime dependency."""
import hashlib
import os
from pathlib import Path
from fastapi import HTTPException, Request
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy import select
from .models import Project, ProjectSchedule, ProjectProfile, ProjectMilestone, ProjectMilestoneFields, ProjectUpdate, ProjectImage, ProjectFile, TaskContent, KnowledgeDocument, serialize
from .schemas import ProjectProfileIn, MilestoneIn, ProjectUpdateIn
from .services import stamp, local_today

MILESTONE_TEMPLATE = ['立项', '结构设计', '手板打样', '交手板样', '确认', 'DFM', '投模', '专利', 'T0', 'T1', '试产备料', '试产', '转量产']
EXTRA_FIELDS = ['deliverable','priority','document_ids']


def project_start_date(session,project_id):
    schedule=session.get(ProjectSchedule,project_id)
    return schedule.start_date if schedule else ''


def save_project_start_date(session,project_id,start_date):
    schedule=session.get(ProjectSchedule,project_id)
    if not schedule:
        schedule=ProjectSchedule(project_id=project_id)
        session.add(schedule)
    schedule.start_date=start_date


def milestone_values(session,row):
    fields=session.get(ProjectMilestoneFields,row.id)
    extra={key:getattr(fields,key) for key in EXTRA_FIELDS} if fields else {'deliverable':'','priority':'','document_ids':[]}
    extra['document_ids']=[identifier for identifier in extra['document_ids'] if (document:=session.get(KnowledgeDocument,identifier)) and document.project_id==row.project_id]
    return {**serialize(row),**extra}


def save_milestone_fields(session,row,values):
    ids=list(dict.fromkeys(values['document_ids']))
    for identifier in ids:
        document=session.get(KnowledgeDocument,identifier)
        if not document or document.project_id!=row.project_id:raise HTTPException(422,'相关文档必须属于当前项目')
    current=session.get(ProjectMilestoneFields,row.id)
    if not current:current=ProjectMilestoneFields(milestone_id=row.id);session.add(current)
    current.deliverable=values['deliverable'];current.priority=values['priority'];current.document_ids=ids


def profile_values(profile):
    return {**ProjectProfileIn().model_dump(), 'progress_known': False} if not profile else {k: v for k, v in serialize(profile).items() if k != 'project_id'}


def ensure_profile(session, project_id):
    profile = session.get(ProjectProfile, project_id)
    if not profile:
        profile = ProjectProfile(project_id=project_id, **profile_values(None))
        session.add(profile)
    return profile


def add_update(session, project_id, content, kind='操作记录'):
    session.add(ProjectUpdate(project_id=project_id, content=content, kind=kind, occurred_on=local_today().isoformat(), author='', created_at=stamp()))


def details(session, project_id):
    if not session.get(Project, project_id):
        raise HTTPException(404, '项目不存在')
    return {
        'profile': profile_values(session.get(ProjectProfile, project_id)),
        'milestones': [milestone_values(session,row) for row in session.scalars(select(ProjectMilestone).where(ProjectMilestone.project_id == project_id).order_by(ProjectMilestone.sort_order, ProjectMilestone.id))],
        'updates': [serialize(row) for row in session.scalars(select(ProjectUpdate).where(ProjectUpdate.project_id == project_id).order_by(ProjectUpdate.created_at.desc(), ProjectUpdate.id))],
        'images': [serialize(row) for row in session.scalars(select(ProjectImage).where(ProjectImage.project_id == project_id).order_by(ProjectImage.sort_order, ProjectImage.id))],
        'files': [serialize(row) for row in session.scalars(select(ProjectFile).where(ProjectFile.project_id==project_id).order_by(ProjectFile.created_at,ProjectFile.id))],
    }


def validated(schema, data):
    try:
        return schema.model_validate(data).model_dump()
    except ValidationError as error:
        raise HTTPException(422, jsonable_encoder(error.errors(), custom_encoder={ValueError: str}))


def register_project_routes(app, factory):
    @app.get('/api/projects/{project_id}/details')
    def get_details(project_id: str):
        with factory() as session:
            return details(session, project_id)

    @app.patch('/api/projects/{project_id}/profile')
    def patch_profile(project_id: str, payload: dict):
        with factory() as session, session.begin():
            if not session.get(Project, project_id):
                raise HTTPException(404, '项目不存在')
            profile = ensure_profile(session, project_id)
            current = {key: getattr(profile, key) for key in ProjectProfileIn.model_fields}
            values = validated(ProjectProfileIn, {**current, **payload})
            for key, value in values.items():
                setattr(profile, key, value)
            add_update(session, project_id, '更新项目目标与团队信息')
            return profile_values(profile)

    def add_record(project_id, payload, model, schema):
        values = validated(schema, payload)
        extras={key:values.pop(key) for key in EXTRA_FIELDS} if model==ProjectMilestone else {}
        with factory() as session, session.begin():
            if not session.get(Project, project_id):
                raise HTTPException(404, '项目不存在')
            row = model(project_id=project_id, **values)
            if model == ProjectUpdate:
                row.created_at = stamp()
            session.add(row)
            session.flush()
            if model == ProjectMilestone:
                save_milestone_fields(session,row,extras)
                session.flush()
                add_update(session, project_id, f'新增节点：{row.name}')
            return milestone_values(session,row) if model==ProjectMilestone else serialize(row)

    def patch_record(project_id, record_id, payload, model, schema):
        with factory() as session, session.begin():
            row = session.get(model, record_id)
            if not row or row.project_id != project_id:
                raise HTTPException(404, '项目记录不存在')
            current=milestone_values(session,row) if model==ProjectMilestone else serialize(row)
            values = validated(schema, {**{key:current[key] for key in schema.model_fields}, **payload})
            extras={key:values.pop(key) for key in EXTRA_FIELDS} if model==ProjectMilestone else {}
            for key, value in values.items():
                setattr(row, key, value)
            if model == ProjectMilestone:
                save_milestone_fields(session,row,extras)
                session.flush()
                add_update(session, project_id, f'更新节点：{row.name} · {row.status}')
            return milestone_values(session,row) if model==ProjectMilestone else serialize(row)

    @app.post('/api/projects/{project_id}/milestones', status_code=201)
    def create_milestone(project_id: str, payload: dict):
        return add_record(project_id, payload, ProjectMilestone, MilestoneIn)

    @app.patch('/api/projects/{project_id}/milestones/{record_id}')
    def edit_milestone(project_id: str, record_id: str, payload: dict):
        return patch_record(project_id, record_id, payload, ProjectMilestone, MilestoneIn)

    @app.post('/api/projects/{project_id}/milestone-template')
    def apply_template(project_id: str):
        with factory() as session, session.begin():
            if not session.get(Project, project_id):
                raise HTTPException(404, '项目不存在')
            rows = list(session.scalars(select(ProjectMilestone).where(ProjectMilestone.project_id == project_id)))
            names = {row.name for row in rows}
            order = max([row.sort_order for row in rows], default=0)
            added = 0
            for name in MILESTONE_TEMPLATE:
                if name not in names:
                    order += 10
                    session.add(ProjectMilestone(project_id=project_id, name=name, sort_order=order))
                    added += 1
            if added:
                add_update(session, project_id, f'补充研发节点模板：{added} 个节点')
            session.flush()
            return {'added': added}

    @app.post('/api/projects/{project_id}/updates', status_code=201)
    def create_update(project_id: str, payload: dict):
        return add_record(project_id, payload, ProjectUpdate, ProjectUpdateIn)

    @app.patch('/api/projects/{project_id}/updates/{record_id}')
    def edit_update(project_id: str, record_id: str, payload: dict):
        return patch_record(project_id, record_id, payload, ProjectUpdate, ProjectUpdateIn)

    @app.post('/api/projects/{project_id}/images', status_code=201)
    async def upload_image(project_id: str, request: Request):
        media = request.headers.get('content-type', '').split(';')[0]
        signatures = {'image/png': ('png', lambda b: b.startswith(b'\x89PNG\r\n\x1a\n')), 'image/jpeg': ('jpg', lambda b: b.startswith(b'\xff\xd8\xff')), 'image/webp': ('webp', lambda b: b[:4] == b'RIFF' and b[8:12] == b'WEBP')}
        if media not in signatures:
            raise HTTPException(422, '请选择 PNG、JPEG 或 WebP 图片')
        chunks, size = [], 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > 10 * 1024 * 1024:
                raise HTTPException(413, '图片应小于 10 MB')
            chunks.append(chunk)
        content = b''.join(chunks)
        extension, check = signatures[media]
        if not check(content):
            raise HTTPException(422, '图片内容与格式不一致')
        filename = hashlib.sha256(content).hexdigest() + '.' + extension
        with factory() as session, session.begin():
            if not session.get(Project, project_id):
                raise HTTPException(404, '项目不存在')
            existing = session.scalar(select(ProjectImage).where(ProjectImage.project_id == project_id, ProjectImage.filename == filename))
            if existing:
                return serialize(existing)
            root = Path(os.getenv('PROJECT_ASSETS', str(Path(__file__).resolve().parents[1] / 'import-assets')))
            root.mkdir(parents=True, exist_ok=True)
            (root / filename).write_bytes(content)
            row = ProjectImage(project_id=project_id, filename=filename, caption='产品示意图', sort_order=10000)
            session.add(row)
            session.flush()
            add_update(session, project_id, '添加产品示意图')
            return serialize(row)
