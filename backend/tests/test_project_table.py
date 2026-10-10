import json
from fastapi.testclient import TestClient
from app.main import create_app
from app.project_table import validate_table,expanded_table
def fixture(tmp_path,monkeypatch):
    data={'schema_version':1,'revision':'fixture','fields':['name','stage','progress','completion_time'],'rows':[{'id':'p1','name':'Test Project','stage':'PVT','progress':90,'completion_time':'待反馈'}]}
    path=tmp_path/'table.json';path.write_text(json.dumps(data),encoding='utf-8');monkeypatch.setenv('PROJECT_TABLE_DATA',str(path));monkeypatch.setenv('APP_MODE','demo');return path,data,'sqlite:///'+(tmp_path/'project-table.db').as_posix()
def test_table_native_edit_conflict_restart_and_undo_preserve_legacy_and_sales(tmp_path,monkeypatch):
    path,data,url=fixture(tmp_path,monkeypatch);original=path.read_bytes()
    with TestClient(create_app(url)) as client:
        legacy=client.get('/api/workspace').json();sales=client.get('/api/sales-history').json();view=client.get('/api/project-table').json();assert view['rows']==expanded_table(data)['rows']
        next_data={**view,'rows':[{**view['rows'][0],'progress':0,'owner':'测试负责人','category':'配件类','node':'ID 设计','start_date':'2026-10-01','deadline':'2026-10-31','deliverable':'PRD','priority':'S+'}]};body={'revision':view['revision'],'data':next_data};saved=client.put('/api/project-table',json=body).json();assert saved['rows'][0]['progress']==0 and saved['can_undo']
        assert client.put('/api/project-table',json=body).status_code==409
        after=client.get('/api/workspace').json();assert after['projects']==legacy['projects'] and after['sales']==legacy['sales'];assert client.get('/api/sales-history').json()==sales
    with TestClient(create_app(url)) as client:
        view=client.get('/api/project-table').json();assert view['rows'][0]['progress']==0
        assert view['rows'][0]['owner']=='测试负责人' and view['rows'][0]['deliverable']=='PRD'
        restored=client.post('/api/project-table/undo',json={'revision':view['revision']}).json();assert restored['rows']==expanded_table(data)['rows'] and not restored['can_undo']
    assert path.read_bytes()==original
def test_table_validation_filters_private_columns_and_rejects_ambiguous_records(tmp_path,monkeypatch):
    path,data,url=fixture(tmp_path,monkeypatch);data['rows'][0]['owner']='PRIVATE';assert 'owner' not in validate_table(data)['rows'][0]
    data['rows'][0]['progress']=True
    try:validate_table(data);assert False
    except Exception as error:assert error.status_code==422
    with TestClient(create_app(url,seed_demo=False)) as client:
        view=client.get('/api/project-table').json();next_data={**view,'fields':view['fields']+['owner'],'rows':[{**view['rows'][0],'owner':'PRIVATE'}]};assert client.put('/api/project-table',json={'revision':view['revision'],'data':next_data}).status_code==422
