"""Node-scoped uploads; file bytes are never part of a public preview export."""
import hashlib,os,re
from pathlib import Path
from fastapi import HTTPException,Request
from fastapi.responses import FileResponse
from sqlalchemy import select,func
from .models import ProjectMilestone,ProjectFile,serialize
from .services import stamp

MAX_FILE_BYTES=20*1024*1024

def files_root():
    return Path(os.getenv('PROJECT_FILES',str(Path(__file__).resolve().parents[1]/'project-files'))).resolve()

def node_exists(session,project_id,node_id):
    node=session.get(ProjectMilestone,node_id)
    if not node or node.project_id!=project_id:raise HTTPException(404,'项目节点不存在')

def register_file_routes(app,factory):
    @app.post('/api/projects/{project_id}/milestones/{node_id}/files',status_code=201)
    async def upload(project_id:str,node_id:str,request:Request,name:str):
        if not name or len(name)>200 or name in ('.','..') or re.search(r'[\\/\x00-\x1f\x7f]',name):raise HTTPException(422,'文件名格式不正确')
        with factory() as session:node_exists(session,project_id,node_id)
        chunks=[];size=0
        async for chunk in request.stream():
            size+=len(chunk)
            if size>MAX_FILE_BYTES:raise HTTPException(413,'单个文件应不超过 20 MB')
            chunks.append(chunk)
        if not size:raise HTTPException(422,'请选择非空文件')
        content=b''.join(chunks);digest=hashlib.sha256(content).hexdigest()
        media=request.headers.get('content-type','application/octet-stream').split(';')[0][:100]
        with factory() as session,session.begin():
            node_exists(session,project_id,node_id)
            existing=session.scalar(select(ProjectFile).where(ProjectFile.project_id==project_id,ProjectFile.milestone_id==node_id,ProjectFile.name==name,ProjectFile.sha256==digest))
            if existing:return serialize(existing)
            count=session.scalar(select(func.count()).select_from(ProjectFile).where(ProjectFile.milestone_id==node_id))
            used=session.scalar(select(func.sum(ProjectFile.size)).where(ProjectFile.project_id==project_id)) or 0
            if count>=30 or used+size>200*1024*1024:raise HTTPException(413,'节点最多 30 个文件，每个项目文件总量应不超过 200 MB')
            root=files_root();root.mkdir(parents=True,exist_ok=True)
            target=(root/(digest+'.bin')).resolve()
            assert target.is_relative_to(root)
            if not target.exists():target.write_bytes(content)
            row=ProjectFile(project_id=project_id,milestone_id=node_id,name=name,content_type=media,size=size,sha256=digest,created_at=stamp())
            session.add(row);session.flush();return serialize(row)

    @app.get('/api/projects/{project_id}/milestones/{node_id}/files/{file_id}')
    def download(project_id:str,node_id:str,file_id:str):
        with factory() as session:
            node_exists(session,project_id,node_id)
            row=session.get(ProjectFile,file_id)
            if not row or row.project_id!=project_id or row.milestone_id!=node_id:raise HTTPException(404,'文件不存在')
            root=files_root();path=(root/(row.sha256+'.bin')).resolve()
            if not path.is_relative_to(root) or not path.is_file():raise HTTPException(404,'文件内容不存在')
            return FileResponse(path,filename=row.name,media_type='application/octet-stream',headers={'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'})
