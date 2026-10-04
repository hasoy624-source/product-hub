from fastapi.testclient import TestClient
from sqlalchemy import select, func, delete
from app.main import create_app
from app.excel_reader import read_register
from app.import_projects import import_register
from app.native_project_migration import migrate_native_projects
from app.models import ProjectProfile, ProjectSource, ProjectMilestone, ProjectUpdate, ProjectImage, TaskContent, EntityMeta, CustomField
from test_project_import import make_register


def test_import_converts_once_to_independent_business_records(tmp_path, monkeypatch):
    monkeypatch.setenv('APP_MODE', 'demo')
    app = create_app('sqlite:///' + (tmp_path / 'native.db').as_posix(), seed_demo=False)
    package = read_register(make_register(tmp_path), tmp_path / 'assets')
    issue = package['projects'][0]['source']['records'][0]['issues'][0]
    issue['text'] = '完整问题与措施\n' + '长内容' * 200
    with TestClient(app) as client:
        import_register(app.state.Session, package)
        project = client.get('/api/workspace').json()['projects'][0]
        path = '/api/projects/' + project['id']
        data = client.get(path + '/details').json()
        assert data['profile']['phase'] == '预研' and not data['profile']['progress_known']
        assert data['milestones'][0]['planned_start'] == '2026-09-27'
        assert data['milestones'][0]['actual_start'] == ''
        assert '29' in data['milestones'][0]['note']
        assert any('原始履历' == entry['content'] for entry in data['updates'])
        assert any('旧问题' in entry['content'] for entry in data['updates'])
        assert len(data['images']) == 1
        task = client.get('/api/workspace').json()['tasks'][0]
        assert task['description'] == issue['text']
        assert client.patch(path, json={'profile': {'target': '正式项目目标', 'priority': 'S+'}}).status_code == 200
        assert client.patch(path + '/milestones/' + data['milestones'][0]['id'], json={'name': '已编辑节点'}).status_code == 200
        assert client.patch('/api/tasks/' + task['id'], json={'description': '后续人工措施\n第二行'}).status_code == 200
        import_register(app.state.Session, package)
        assert client.get(path + '/details').json()['profile']['target'] == '正式项目目标'
        assert client.get(path + '/details').json()['milestones'][0]['name'] == '已编辑节点'
        with app.state.Session() as session, session.begin():
            before = session.scalar(select(func.count()).select_from(ProjectUpdate))
            assert migrate_native_projects(session) == 0
            assert session.scalar(select(func.count()).select_from(ProjectUpdate)) == before
            assert session.scalar(select(CustomField).where(CustomField.key == 'excel_priority')).active is False
            assert 'excel_priority' not in session.get(EntityMeta, ('project', project['id'])).values
            session.execute(delete(ProjectSource))
        # Native runtime still operates after the entire import ledger is removed.
        assert client.get(path + '/details').json()['profile']['target'] == '正式项目目标'
        assert client.get('/api/workspace').json()['tasks'][0]['description'] == '后续人工措施\n第二行'
        assert client.patch(path + '/profile', json={'phase': '试产备料'}).status_code == 200
        assert client.get(path + '/details').json()['profile']['phase'] == '试产备料'


def test_unlabelled_dates_are_editable_records_not_actual_completion(tmp_path, monkeypatch):
    monkeypatch.setenv('APP_MODE', 'demo')
    package = read_register(make_register(tmp_path), tmp_path / 'assets')
    package['projects'][0]['source']['records'][0]['timeline'][0]['row_kind'] = '原表节点'
    app = create_app('sqlite:///' + (tmp_path / 'dates.db').as_posix(), seed_demo=False)
    with TestClient(app) as client:
        import_register(app.state.Session, package)
        data = client.get('/api/projects/' + package['projects'][0]['id'] + '/details').json()
        node = data['milestones'][0]
        assert node['planned_start'] == node['actual_start'] == node['actual_end'] == ''
        assert node['status'] == '待确认' and '2026-09-27' in node['recorded_text']


def test_manual_projects_use_same_profile_nodes_updates_and_persist(tmp_path, monkeypatch):
    monkeypatch.setenv('APP_MODE', 'demo')
    url = 'sqlite:///' + (tmp_path / 'manual.db').as_posix()
    with TestClient(create_app(url, seed_demo=False)) as client:
        response = client.post('/api/projects', json={'name': '正式研发项目', 'profile': {'target': '产品定义', 'phase': '结构设计', 'priority': 'S', 'structural_owner': '李工'}})
        assert response.status_code == 201
        project = response.json()
        path = '/api/projects/' + project['id']
        assert not client.get(path + '/details').json()['profile']['progress_known']
        assert client.post(path + '/milestone-template').json() == {'added': 13}
        assert client.post(path + '/milestone-template').json() == {'added': 0}
        node = client.get(path + '/details').json()['milestones'][0]
        assert client.patch(path + '/milestones/' + node['id'], json={'owner': '王工', 'planned_start': '2026-10-05', 'planned_end': '2026-10-12', 'status': '进行中', 'note': '确认评审'}).status_code == 200
        update = client.post(path + '/updates', json={'content': '首次评审\n通过', 'occurred_on': '2026-10-04', 'author': '李工', 'kind': '关键节点'}).json()
        assert client.patch(path + '/updates/' + update['id'], json={'content': '首次评审\n待补充'}).status_code == 200
        task = client.post('/api/tasks', json={'project_id': project['id'], 'title': '评审任务', 'description': '补充评审材料'}).json()
        assert client.patch('/api/tasks/' + task['id'], json={'status': '已完成'}).status_code == 200
        assert client.patch(path, json={'progress': 0, 'profile': {'risk_note': '供应计划待确认'}}).status_code == 200
    with TestClient(create_app(url, seed_demo=False)) as client:
        data = client.get(path + '/details').json()
        assert data['profile']['target'] == '产品定义' and data['profile']['risk_note'] == '供应计划待确认'
        assert data['profile']['progress_known'] is True
        assert data['milestones'][0]['owner'] == '王工'
        assert any(entry['content'] == '首次评审\n待补充' for entry in data['updates'])
        final = client.get('/api/workspace').json()
        assert len(final['projects']) == 1 and final['tasks'][0]['description'] == '补充评审材料'
        assert final['tasks'][0]['status'] == '已完成'
        assert final['products'] == []


def test_native_records_validate_and_respect_project_identity(tmp_path, monkeypatch):
    monkeypatch.setenv('APP_MODE', 'demo')
    with TestClient(create_app('sqlite:///' + (tmp_path / 'validation.db').as_posix(), seed_demo=False)) as client:
        first = client.post('/api/projects', json={'name': '一'}).json()['id']
        other = client.post('/api/projects', json={'name': '二'}).json()['id']
        path = '/api/projects/' + first
        node = client.post(path + '/milestones', json={'name': '试产'}).json()
        for values in [{'planned_start': '2026-02-30'}, {'actual_start': '2026-10-10', 'actual_end': '2026-10-01'}, {'name': ''}, {'sort_order': -1}, {'status': '随意'}, {'project_id': other}]:
            assert client.patch(path + '/milestones/' + node['id'], json=values).status_code == 422
        assert client.patch('/api/projects/' + other + '/milestones/' + node['id'], json={'name': '跨项目'}).status_code == 404
        assert client.get('/api/projects/missing/details').status_code == 404
        assert client.post('/api/projects/missing/updates', json={'content': '内容'}).status_code == 404
        assert client.post(path + '/updates', json={'content': '   '}).status_code == 422
        assert client.patch(path, json={'profile': {'actual_completed_on': '2026-02-30'}}).status_code == 422
        assert client.patch(path, json={'profile': {'progress_known': True}}).status_code == 422
        assert client.get(path + '/details').json()['milestones'][0]['name'] == '试产'


def test_native_image_upload_is_persistent_and_rejects_invalid_input(tmp_path, monkeypatch):
    monkeypatch.setenv('APP_MODE', 'demo')
    monkeypatch.setenv('PROJECT_ASSETS', str(tmp_path / 'images'))
    with TestClient(create_app('sqlite:///' + (tmp_path / 'images.db').as_posix(), seed_demo=False)) as client:
        project = client.post('/api/projects', json={'name': '图片项目'}).json()['id']
        path = '/api/projects/' + project + '/images'
        png = b'\x89PNG\r\n\x1a\n' + b'fixture-image'
        first = client.post(path, content=png, headers={'content-type': 'image/png'})
        assert first.status_code == 201
        assert client.post(path, content=png, headers={'content-type': 'image/png'}).json()['id'] == first.json()['id']
        assert client.get('/api/project-assets/' + first.json()['filename']).content == png
        assert len(client.get('/api/projects/' + project + '/details').json()['images']) == 1
        assert client.post(path, content=b'<svg/>', headers={'content-type': 'image/svg+xml'}).status_code == 422
        assert client.post(path, content=b'not-png', headers={'content-type': 'image/png'}).status_code == 422
        assert client.post(path, content=b'x' * (10 * 1024 * 1024 + 1), headers={'content-type': 'image/png'}).status_code == 413
