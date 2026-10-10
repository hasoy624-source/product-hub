import json
from fastapi.testclient import TestClient
from app.main import create_app
def test_table_image_and_file_upload_are_scoped_persistent_and_not_in_seed(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo');monkeypatch.setenv('PROJECT_TABLE_FILES',str(tmp_path/'files'))
    seed={'schema_version':1,'revision':'seed','fields':['name','stage','progress','completion_time'],'rows':[{'id':'p1','name':'测试项目','stage':'EVT','progress':None,'completion_time':''},{'id':'p2','name':'另一个项目','stage':'PVT','progress':0,'completion_time':''}]}
    path=tmp_path/'seed.json';path.write_text(json.dumps(seed),encoding='utf-8');original=path.read_bytes();monkeypatch.setenv('PROJECT_TABLE_DATA',str(path));url='sqlite:///'+(tmp_path/'db.db').as_posix()
    with TestClient(create_app(url,seed_demo=False)) as client:
        assert client.post('/api/project-table/missing/files?name=test.txt',content=b'123').status_code==404
        assert client.post('/api/project-table/p1/files?name=bad.png&kind=image',content=b'<svg/>').status_code==422
        uploaded=client.post('/api/project-table/p1/files?name=test.txt',content=b'file content');assert uploaded.status_code==201;file=uploaded.json()
        duplicate=client.post('/api/project-table/p1/files?name=test.txt',content=b'file content').json();assert duplicate['id']==file['id']
        assert client.get('/api/project-table/p2/files/'+file['id']).status_code==404
        assert client.get('/api/project-table/p1/files/'+file['id']).content==b'file content'
        logo=(__import__('pathlib').Path(__file__).resolve().parents[2]/'frontend/src/assets/impetus-logo.png').read_bytes()
        image=client.post('/api/project-table/p1/files?name=logo.png&kind=image',content=logo,headers={'Content-Type':'image/png'}).json()
        response=client.get('/api/project-table/p1/files/'+image['id']);assert response.content==logo and response.headers['content-type']=='image/png'
        assert all('files' not in row for row in client.get('/api/project-table').json()['rows'])
    with TestClient(create_app(url,seed_demo=False)) as client:assert len(client.get('/api/project-table/p1/files').json())==2
    assert path.read_bytes()==original
