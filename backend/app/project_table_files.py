"""Files for native table rows; never published with static project data."""
import hashlib,os,re
from pathlib import Path
from fastapi import Request,HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select,func
from .models import ProjectTableFile,serialize
from .project_table import table_view
from .services import stamp
def root():return Path(os.getenv('PROJECT_TABLE_FILES',str(Path(__file__).resolve().parents[1]/'project-table-files'))).resolve()
def exists(session,identifier):
    if not any(row['id']==identifier for row in table_view(session)['rows']):raise HTTPException(404,'项目表记录不存在')
def register_table_file_routes(app,factory):
    @app.get('/api/project-table/{project_id}/files')
    def files(project_id:str):
        with factory() as session:
            exists(session,project_id);return [serialize(row) for row in session.scalars(select(ProjectTableFile).where(ProjectTableFile.project_id==project_id).order_by(ProjectTableFile.created_at))]
    @app.post('/api/project-table/{project_id}/files',status_code=201)
    async def upload(project_id:str,request:Request,name:str,kind:str='file'):
        if kind not in ['file','image'] or not name or len(name)>200 or name in ['.','..'] or re.search(r'[\\/\x00-\x1f\x7f]',name):raise HTTPException(422,'文件类型或名称不正确')
        with factory() as session:exists(session,project_id)
        size=0;chunks=[]
        async for chunk in request.stream():
            size+=len(chunk)
            if size>(10 if kind=='image' else 20)*1024*1024:raise HTTPException(413,'图片不超过 10 MB，文件不超过 20 MB')
            chunks.append(chunk)
        if not size:raise HTTPException(422,'请选择非空文件')
        content=b''.join(chunks);digest=hashlib.sha256(content).hexdigest();media=request.headers.get('content-type','application/octet-stream').split(';')[0][:100]
        if kind=='image':
            detected='image/png' if content.startswith(b'\x89PNG\r\n\x1a\n') else 'image/jpeg' if content.startswith(b'\xff\xd8\xff') else 'image/webp' if content.startswith(b'RIFF') and content[8:12]==b'WEBP' else None
            if detected is None:raise HTTPException(422,'请选择 PNG、JPEG 或 WebP 图片')
            media=detected
        marker='project-table-'+kind
        with factory() as session,session.begin():
            exists(session,project_id)
            old=session.scalar(select(ProjectTableFile).where(ProjectTableFile.project_id==project_id,ProjectTableFile.milestone_id==marker,ProjectTableFile.name==name,ProjectTableFile.sha256==digest))
            if old:return serialize(old)
            count=session.scalar(select(func.count()).select_from(ProjectTableFile).where(ProjectTableFile.project_id==project_id,ProjectTableFile.milestone_id==marker))
            used=session.scalar(select(func.sum(ProjectTableFile.size)).where(ProjectTableFile.project_id==project_id)) or 0
            if count>=30 or used+size>200*1024*1024:raise HTTPException(413,'每类最多 30 个文件，项目文件总量不超过 200 MB')
            folder=root();folder.mkdir(parents=True,exist_ok=True);target=(folder/(digest+'.bin')).resolve();assert target.is_relative_to(folder)
            if not target.exists():target.write_bytes(content)
            row=ProjectTableFile(project_id=project_id,milestone_id=marker,name=name,content_type=media,size=size,sha256=digest,created_at=stamp());session.add(row);session.flush();return serialize(row)
    @app.get('/api/project-table/{project_id}/files/{file_id}')
    def download(project_id:str,file_id:str):
        with factory() as session:
            exists(session,project_id);row=session.get(ProjectTableFile,file_id)
            if not row or row.project_id!=project_id:raise HTTPException(404,'文件不存在')
            folder=root();path=(folder/(row.sha256+'.bin')).resolve()
            if not path.is_relative_to(folder) or not path.is_file():raise HTTPException(404,'文件内容不存在')
            image=row.milestone_id=='project-table-image'
            return FileResponse(path,filename=None if image else row.name,media_type=row.content_type if image else 'application/octet-stream',headers={'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'})
