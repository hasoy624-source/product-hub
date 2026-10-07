from fastapi.testclient import TestClient
from app.main import create_app
from app.export_preview import read_snapshot


def test_workbook_node_fields_persist_and_partial_edits_keep_document_links(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo')
    path=tmp_path/'workbook.db'
    app=create_app('sqlite:///'+path.as_posix(),seed_demo=False)
    with TestClient(app) as client:
        project=client.post('/api/projects',json={'name':'新产品','stage':'概念与启动'}).json()
        other=client.post('/api/projects',json={'name':'另一个产品','stage':'概念与启动'}).json()
        doc=client.post('/api/knowledge_documents',json={'project_id':project['id'],'template_id':'c-prd','stage':'概念与启动','title':'项目 PRD','owner':'林工','status':'草稿','content':'真实产品需求'}).json()
        other_doc=client.post('/api/knowledge_documents',json={'project_id':other['id'],'template_id':'c-prd','stage':'概念与启动','title':'其它项目文档','owner':'林工','status':'草稿','content':''}).json()
        base='/api/projects/'+project['id']
        response=client.post(base+'/milestones',json={'name':'ID设计','deliverable':'ID设计图 / CMF','priority':'高','document_ids':[doc['id'],doc['id']]})
        assert response.status_code==201,response.text
        node=response.json();assert node['document_ids']==[doc['id']]
        assert node['planned_end']=='' and node['owner']==''
        changed=client.patch(base+'/milestones/'+node['id'],json={'planned_end':'2026-10-30'})
        assert changed.status_code==200
        assert changed.json()['priority']=='高' and changed.json()['deliverable']=='ID设计图 / CMF'
        assert changed.json()['document_ids']==[doc['id']]
        bad=client.patch(base+'/milestones/'+node['id'],json={'document_ids':[other_doc['id']]})
        assert bad.status_code==422
        data=client.get(base+'/details').json()
        assert data['milestones'][0]['document_ids']==[doc['id']]
    reopened=create_app('sqlite:///'+path.as_posix(),seed_demo=False)
    with TestClient(reopened) as client:
        assert client.get(base+'/details').json()['milestones'][0]['priority']=='高'
    snapshot,_=read_snapshot(path)
    stored=snapshot['workspace']['project_details'][project['id']]['milestones'][0]
    assert stored['planned_end']=='2026-10-30' and stored['document_ids']==[doc['id']]


def test_workbook_metadata_validation_and_date_ranges_are_atomic(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo')
    app=create_app('sqlite:///'+(tmp_path/'ranges.db').as_posix(),seed_demo=False)
    with TestClient(app) as client:
        project=client.post('/api/projects',json={'name':'新品','stage':'EVT'}).json()
        base='/api/projects/'+project['id']
        assert client.post(base+'/milestones',json={'name':'测试','document_ids':['missing']}).status_code==422
        assert client.post(base+'/milestones',json={'name':'测试','deliverable':'x'*201}).status_code==422
        node=client.post(base+'/milestones',json={'name':'验证','planned_start':'2026-10-15','planned_end':'2026-10-30','priority':'S+'}).json()
        assert client.patch(base+'/milestones/'+node['id'],json={'planned_end':'2026-10-01','priority':'低'}).status_code==422
        stored=client.get(base+'/details').json()['milestones'][0]
        assert stored['priority']=='S+' and stored['planned_end']=='2026-10-30'
