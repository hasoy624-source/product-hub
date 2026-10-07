import sqlite3
from fastapi.testclient import TestClient
from app.main import create_app
from app.export_preview import read_snapshot


def test_project_start_date_persists_across_patch_restart_and_export(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo')
    database=tmp_path/'starts.db';url='sqlite:///'+database.as_posix()
    with TestClient(create_app(url,seed_demo=False)) as client:
        response=client.post('/api/projects',json={'name':'日期项目','start_date':'2026-09-01','due_date':'2026-10-30'})
        assert response.status_code==201,response.text
        project=response.json();assert project['start_date']=='2026-09-01'
        path='/api/projects/'+project['id']
        assert client.patch(path,json={'owner':'林工'}).json()['start_date']=='2026-09-01'
        assert client.patch(path,json={'start_date':'2026-09-05'}).json()['start_date']=='2026-09-05'
        node=client.post(path+'/milestones',json={'name':'ID设计','planned_start':'2026-09-10','planned_end':'2026-09-20'}).json()
        assert node['planned_start']=='2026-09-10'
    with TestClient(create_app(url,seed_demo=False)) as client:
        stored=client.get('/api/workspace').json()['projects'][0]
        assert stored['start_date']=='2026-09-05' and stored['owner']=='林工'
        assert client.get(path+'/details').json()['milestones'][0]['planned_start']=='2026-09-10'
    snapshot,_=read_snapshot(database)
    assert snapshot['workspace']['projects'][0]['start_date']=='2026-09-05'


def test_start_dates_validate_merged_ranges_without_partial_changes(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo')
    with TestClient(create_app('sqlite:///'+(tmp_path/'validation.db').as_posix(),seed_demo=False)) as client:
        for data in [{'start_date':'2026-02-30'},{'start_date':'2026-10-15','due_date':'2026-10-01'},{'start_date':None}]:
            assert client.post('/api/projects',json={'name':'错误项目',**data}).status_code==422
        assert client.get('/api/workspace').json()['projects']==[]
        project=client.post('/api/projects',json={'name':'正常项目','start_date':'2026-10-01','due_date':'2026-10-30'}).json()
        path='/api/projects/'+project['id']
        for data in [{'start_date':'2026-11-01'},{'due_date':'2026-09-30'},{'start_date':'bad'}]:
            assert client.patch(path,json={'owner':'错误修改',**data}).status_code==422
        stored=client.get('/api/workspace').json()['projects'][0]
        assert stored['start_date']=='2026-10-01' and stored['due_date']=='2026-10-30' and stored['owner']==''
        assert client.patch(path,json={'start_date':''}).json()['start_date']==''
        assert client.patch('/api/projects/missing',json={'start_date':'2026-10-01'}).status_code==404


def test_legacy_database_exports_without_added_project_columns_or_schedule_table(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo')
    database=tmp_path/'legacy.db'
    with TestClient(create_app('sqlite:///'+database.as_posix(),seed_demo=False)) as client:
        project=client.post('/api/projects',json={'name':'旧项目'}).json()
        assert project['start_date']==''
    with sqlite3.connect(database) as connection:
        assert 'start_date' not in [row[1] for row in connection.execute('PRAGMA table_info(projects)')]
        connection.execute('DROP TABLE project_schedules')
    snapshot,_=read_snapshot(database)
    assert len(snapshot['workspace']['projects'])==1
    assert 'start_date' not in snapshot['workspace']['projects'][0]
