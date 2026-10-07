from urllib.parse import quote
from fastapi.testclient import TestClient
from app.main import create_app
from app.export_preview import read_snapshot

def fixture(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo');monkeypatch.setenv('PROJECT_FILES',str(tmp_path/'files'))
    return 'sqlite:///'+(tmp_path/'uploads.db').as_posix()

def test_node_upload_download_restart_and_deduplication(tmp_path,monkeypatch):
    url=fixture(tmp_path,monkeypatch)
    with TestClient(create_app(url,seed_demo=False)) as client:
        p=client.post('/api/projects',json={'name':'附件项目'}).json()['id']
        n=client.post(f'/api/projects/{p}/milestones',json={'name':'评审'}).json()['id']
        base=f'/api/projects/{p}/milestones/{n}/files';name='评审报告.txt';content='英霏特文件内容'.encode()
        response=client.post(base+'?name='+quote(name),content=content,headers={'Content-Type':'text/plain'})
        assert response.status_code==201,response.text
        file=response.json();assert file['name']==name and file['size']==len(content)
        assert client.post(base+'?name='+quote(name),content=content).json()['id']==file['id']
        data=client.get(f'/api/projects/{p}/details').json();assert len(data['files'])==1
        download=client.get(base+'/'+file['id']);assert download.content==content
        assert download.headers['content-type']=='application/octet-stream'
        assert download.headers['content-disposition'].startswith('attachment;')
    with TestClient(create_app(url,seed_demo=False)) as client:
        assert client.get(base+'/'+file['id']).content==content
        assert client.get(f'/api/projects/{p}/details').json()['files'][0]['id']==file['id']
    snapshot,_=read_snapshot(tmp_path/'uploads.db')
    assert 'files' not in snapshot['workspace']['project_details'][p]

def test_upload_validation_and_cross_project_boundaries(tmp_path,monkeypatch):
    with TestClient(create_app(fixture(tmp_path,monkeypatch),seed_demo=False)) as client:
        p=client.post('/api/projects',json={'name':'一'}).json()['id'];q=client.post('/api/projects',json={'name':'二'}).json()['id']
        n=client.post(f'/api/projects/{p}/milestones',json={'name':'节点'}).json()['id']
        m=client.post(f'/api/projects/{q}/milestones',json={'name':'节点'}).json()['id']
        base=f'/api/projects/{p}/milestones/{n}/files'
        for name in ['../a','a\\b','a\n','..']:
            assert client.post(base+'?name='+quote(name),content=b'x').status_code==422
        assert client.post(base+'?name=empty.txt',content=b'').status_code==422
        assert client.post(base+'?name=large.txt',content=b'x'*(20*1024*1024+1)).status_code==413
        assert client.post(f'/api/projects/{q}/milestones/{n}/files?name=x',content=b'x').status_code==404
        file=client.post(base+'?name=test.html',content=b'<b>file bytes</b>',headers={'Content-Type':'text/html'}).json()
        assert client.get(f'/api/projects/{q}/milestones/{m}/files/'+file['id']).status_code==404
        assert client.get(base+'/missing').status_code==404
        assert client.get(base+'/'+file['id']).headers['content-type']=='application/octet-stream'

def test_file_count_limit_does_not_add_failed_uploads(tmp_path,monkeypatch):
    with TestClient(create_app(fixture(tmp_path,monkeypatch),seed_demo=False)) as client:
        p=client.post('/api/projects',json={'name':'配额项目'}).json()['id'];n=client.post(f'/api/projects/{p}/milestones',json={'name':'节点'}).json()['id']
        base=f'/api/projects/{p}/milestones/{n}/files'
        for index in range(30):assert client.post(base+f'?name=file-{index}.txt',content=b'content').status_code==201
        assert client.post(base+'?name=extra.txt',content=b'content').status_code==413
        assert len(client.get(f'/api/projects/{p}/details').json()['files'])==30
