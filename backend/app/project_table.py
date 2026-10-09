"""Independent native table; previous projects and all sales remain untouched."""
import copy,json,os,re,uuid,unicodedata
from pathlib import Path
from datetime import date
from fastapi import HTTPException
from pydantic import BaseModel,Field
from sqlalchemy import select,update
from sqlalchemy.exc import IntegrityError
from .models import ProjectTableState
PUBLIC=['name','stage','progress','completion_time']
FIELDS=['name','priority','stage','progress','planned_progress','description','completion_time','owner','structural_owner','project_kind']
def validate_table(data):
    try:
        if type(data['schema_version']) is not int or data['schema_version']!=1 or not isinstance(data['revision'],str) or not data['revision'] or not isinstance(data['rows'],list) or len(data['rows'])>2000 or not isinstance(data['fields'],list):raise ValueError('项目表结构不正确')
        fields=data['fields']
        if len(set(fields))!=len(fields) or not set(PUBLIC)<=set(fields) or not set(fields)<=set(FIELDS):raise ValueError('项目表字段不正确')
        rows=[];ids=set();names=set()
        for source in data['rows']:
            identifier=source['id']
            if not isinstance(identifier,str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,80}',identifier) or identifier in ids:raise ValueError('项目标识重复或不正确')
            ids.add(identifier);row={'id':identifier}
            for field in fields:
                value=source[field]
                if field in ['progress','planned_progress']:
                    if value is not None and (type(value) not in [int,float] or not 0<=value<=100):raise ValueError('项目进度应为 0–100 或空缺')
                else:
                    if not isinstance(value,str) or len(value)>(10000 if field=='description' else 200 if field=='name' else 300) or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]',value):raise ValueError('项目字段格式不正确')
                    value=value.strip()
                row[field]=value
            key=re.sub(r'\s+','',unicodedata.normalize('NFKC',row['name'])).casefold()
            if not key or key in names:raise ValueError('项目名称为空或重复')
            names.add(key)
            if re.fullmatch(r'\d{4}-\d{2}-\d{2}',row['completion_time']):date.fromisoformat(row['completion_time'])
            rows.append(row)
        return {'schema_version':1,'revision':data['revision'],'fields':list(fields),'rows':rows}
    except (KeyError,TypeError):raise HTTPException(422,'项目表结构不正确')
    except ValueError as error:raise HTTPException(422,str(error))
def seed_table():
    root=Path(__file__).resolve().parents[2];private=root/'backend/project-table/current.json'
    default=private if private.is_file() else root/'frontend/public/project-table/current.json'
    if not default.is_file():default=Path(os.getenv('FRONTEND_DIST',str(root/'frontend/dist')))/'project-table/current.json'
    path=Path(os.getenv('PROJECT_TABLE_DATA',str(default)))
    if not path.is_file():return {'schema_version':1,'revision':'empty','fields':PUBLIC,'rows':[]}
    try:return validate_table(json.loads(path.read_text(encoding='utf-8')))
    except (OSError,ValueError):raise HTTPException(500,'项目表读取失败')
def table_view(session):
    state=session.get(ProjectTableState,'project-table');data=copy.deepcopy(state.data) if state else seed_table()
    return {**data,'revision':state.version if state else 'seed:'+data['revision'],'storage':'server','can_undo':bool(state and state.previous is not None)}
class TableIn(BaseModel):
    revision:str=Field(min_length=1,max_length=100)
    data:dict
class VersionIn(BaseModel):revision:str=Field(min_length=1,max_length=100)
def register_table_routes(app,factory):
    @app.get('/api/project-table')
    def read():
        with factory() as session:return table_view(session)
    @app.put('/api/project-table')
    def save(payload:TableIn):
        data=validate_table(payload.data)
        try:
            with factory() as session,session.begin():
                state=session.scalar(select(ProjectTableState).where(ProjectTableState.id=='project-table').with_for_update());current=table_view(session)
                if current['revision']!=payload.revision:raise HTTPException(409,'项目表已更新，请重新读取')
                if data['fields']!=current['fields']:raise HTTPException(422,'不能改变项目表字段范围')
                if data['rows']==current['rows']:return current
                previous={key:current[key] for key in ['schema_version','revision','fields','rows']};version=uuid.uuid4().hex
                if state:
                    count=session.execute(update(ProjectTableState).where(ProjectTableState.id=='project-table',ProjectTableState.version==payload.revision).values(data=data,previous=previous,version=version)).rowcount
                    if count!=1:raise HTTPException(409,'项目表已更新，请重新读取')
                    session.expire(state)
                else:session.add(ProjectTableState(id='project-table',version=version,data=data,previous=previous))
                session.flush();return table_view(session)
        except IntegrityError:raise HTTPException(409,'项目表已更新，请重新读取')
    @app.post('/api/project-table/undo')
    def undo(payload:VersionIn):
        with factory() as session,session.begin():
            state=session.scalar(select(ProjectTableState).where(ProjectTableState.id=='project-table').with_for_update())
            if not state or state.version!=payload.revision:raise HTTPException(409,'项目表已更新，请重新读取')
            if state.previous is None:raise HTTPException(409,'没有可撤销的项目表')
            count=session.execute(update(ProjectTableState).where(ProjectTableState.id=='project-table',ProjectTableState.version==payload.revision).values(data=state.previous,previous=None,version=uuid.uuid4().hex)).rowcount
            if count!=1:raise HTTPException(409,'项目表已更新，请重新读取')
            session.expire(state);session.flush();return table_view(session)
