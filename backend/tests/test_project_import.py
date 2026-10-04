import copy
from pathlib import Path
import zipfile
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from app.database import database, initialize
from app.excel_reader import excel_date, identifier, phase_for, read_register, status_for
from app.import_projects import import_register
from app.main import create_app
from app.models import Project, ProjectSource, Task


@pytest.mark.parametrize('raw,expected', [('1', '1900-01-01'), ('59', '1900-02-28'), ('60', ''), ('61', '1900-03-01'), ('46292', '2026-09-27'), ('2026/9/19', '2026-09-19'), ('2026/2/30', ''), ('2026/9/19-20', ''), ('时间未确认', ''), ('/', '')])
def test_dates_do_not_invent_missing_or_invalid_values(raw, expected):
    assert excel_date(raw) == expected
    assert excel_date('0', True) == '1904-01-01'


@pytest.mark.parametrize('raw,expected', [('预研', '概念与启动'), ('结构设计', '设计与开发'), ('手板样', '设计与开发'), ('模具制作', 'EVT'), ('开模中', 'EVT'), ('试产', 'DVT'), ('转量产', 'MP'), ('', '待确认')])
def test_stage_mapping_keeps_unknown_as_unknown(raw, expected):
    assert phase_for(raw, '') == expected


def make_register(tmp_path):
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    def cell(address, value):
        return f'<c r="{address}" t="inlineStr"><is><t>{value}</t></is></c>'
    headers = {'A': '项目号', 'B': '状态', 'C': '类别', 'D': '当前阶段', 'E': '优先级', 'F': '项目工程师', 'G': '计划完成时间', 'H': '当前问题点及措施', 'I': '履历', 'J': '产品示意图', 'P': '分项', 'Q': '开始时间'}
    def sheet(code, status, phase, issue='', owner='', due='', extra=''):
        return f'<worksheet xmlns="{ns}" xmlns:r="{rel}"><sheetData><row r="1">{cell("Q1", "结构设计")}</row><row r="2">{"".join(cell(c+"2",v) for c,v in headers.items())}</row><row r="3">{cell("A3",code)}{cell("B3",status)}{cell("C3","电池类")}{cell("D3",phase)}{cell("F3",owner)}{cell("G3",due)}{cell("H3",issue)}{cell("I3","原始履历")}{cell("P3","计划时间")}{cell("Q3","46292")}</row>{extra}</sheetData><drawing r:id="image"/></worksheet>'
    path = tmp_path / 'register.xlsx'
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('xl/workbook.xml', f'<workbook xmlns="{ns}" xmlns:r="{rel}"><sheets><sheet name="项目进度总表" sheetId="1" r:id="s1"/><sheet name="转量产表" state="hidden" sheetId="2" r:id="s2"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="s1" Target="worksheets/sheet1.xml"/><Relationship Id="s2" Target="worksheets/sheet2.xml"/></Relationships>')
        z.writestr('xl/worksheets/sheet1.xml', sheet('X-001', '未立项', '预研', '确认要求', extra=f'<row r="4">{cell("P4","延期天数")}{cell("Q4","29")}</row>'))
        z.writestr('xl/worksheets/sheet2.xml', sheet('x-001', '已转产', '转量产', '旧问题', '历史负责人', '46000'))
        z.writestr('xl/worksheets/_rels/sheet1.xml.rels', '<Relationships><Relationship Id="image" Target="../drawings/drawing1.xml" Type="drawing/drawing"/></Relationships>')
        z.writestr('xl/drawings/drawing1.xml', f'<wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="{rel}"><oneCellAnchor><from><col>9</col><row>2</row></from><pic><a:blip r:embed="p1"/></pic></oneCellAnchor></wsDr>')
        z.writestr('xl/drawings/_rels/drawing1.xml.rels', '<Relationships><Relationship Id="p1" Target="media/image.png"/></Relationships>')
        z.writestr('xl/drawings/media/image.png', b'original-image-bytes')
    return path


def test_reader_preserves_duplicates_hidden_sheets_cells_and_original_image_bytes(tmp_path):
    path = make_register(tmp_path)
    original = path.read_bytes()
    package = read_register(path, tmp_path / 'assets')
    assert path.read_bytes() == original
    assert package['record_count'] == 2 and len(package['projects']) == 1
    project = package['projects'][0]
    assert project['name'] == 'X-001' and project['id'] == identifier('x-001')
    assert project['stage'] == '概念与启动' and project['status'] == '待立项'
    assert project['owner'] == project['due_date'] == ''
    assert project['source']['progress_known'] is False
    records = project['source']['records']
    assert records[1]['hidden'] is True
    assert records[0]['timeline'][1]['raw'] == '29' and records[0]['timeline'][1]['date'] == ''
    assert records[0]['raw_rows'][0]['cells'][0]['cell'] == 'A3'
    assert len(project['tasks']) == 1 and project['tasks'][0]['due_date'] == ''
    assert (tmp_path / 'assets' / package['assets'][0]).read_bytes() == b'original-image-bytes'


def test_import_is_atomic_idempotent_and_retains_user_changes(tmp_path):
    package = read_register(make_register(tmp_path), tmp_path / 'assets')
    engine, factory = database('sqlite:///' + (tmp_path / 'test.db').as_posix())
    initialize(engine)
    result = import_register(factory, package)
    assert result['projects_added'] == result['tasks_added'] == 1
    with factory() as session:
        row = session.get(Project, package['projects'][0]['id'])
        row.owner = '后续负责人'
        source = session.get(ProjectSource, row.id)
        source.progress_known = True
        session.commit()
    result = import_register(factory, package)
    assert result['projects_skipped'] == 1 and result['tasks_added'] == 0
    with factory() as session:
        assert session.get(Project, package['projects'][0]['id']).owner == '后续负责人'
        assert session.get(ProjectSource, package['projects'][0]['id']).progress_known is True
        assert session.scalar(select(func.count()).select_from(Task)) == 1
    conflict = copy.deepcopy(package)
    conflict['sha256'] = 'f' * 64
    first = copy.deepcopy(conflict['projects'][0])
    first['id'], first['name'], first['tasks'] = identifier('new'), 'new', []
    conflict['projects'].insert(0, first)
    with pytest.raises(ValueError): import_register(factory, conflict)
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(Project)) == 1
    engine.dispose()


def test_import_api_supports_missing_values_source_details_and_manual_progress(tmp_path, monkeypatch):
    monkeypatch.setenv('APP_MODE', 'demo')
    assets = tmp_path / 'assets'
    monkeypatch.setenv('PROJECT_ASSETS', str(assets))
    package = read_register(make_register(tmp_path), assets)
    app = create_app('sqlite:///' + (tmp_path / 'api.db').as_posix(), seed_demo=False)
    with TestClient(app) as client:
        import_register(app.state.Session, package)
        project = client.get('/api/workspace').json()['projects'][0]
        assert 'import_info' not in project
        assert project['profile']['progress_known'] is False
        assert project['profile']['phase'] == '预研'
        source_url = '/api/project-sources/' + project['id']
        assert client.get(source_url).json()['records'][0]['fields']['履历'] == '原始履历'
        assert client.patch('/api/projects/' + project['id'], json={'owner': '', 'due_date': '', 'status': '待确认', 'stage': '待确认'}).status_code == 200
        assert client.get(source_url).json()['progress_known'] is False
        assert client.patch('/api/projects/' + project['id'], json={'progress': 0}).status_code == 200
        assert client.get(source_url).json()['progress_known'] is True
        dashboard = client.get('/api/dashboard?month=2026-10').json()
        assert dashboard['overdue_tasks'] == dashboard['active_projects'] == 0
        assert client.get('/api/project-assets/' + package['assets'][0]).content == b'original-image-bytes'
        assert client.get('/api/project-assets/invalid.png').status_code == 404
        assert client.get('/api/project-sources/not-found').status_code == 404
        assert client.patch('/api/projects/' + project['id'], json={'due_date': '2026-02-30'}).status_code == 422
        assert client.patch('/api/projects/' + project['id'], json={'import_info': {}}).status_code == 422


def test_original_statuses_are_distinct():
    assert status_for('已终止', '') == '已终止'
    assert status_for('暂停中', '') == '暂停'
    assert status_for('未立项', '') == '待立项'
    assert status_for('已转产', '') == '已完成'
    assert status_for('进行中', '风险原文') == '风险'
    assert status_for('', '') == '待确认'


def rewrite_fixture(path, part, replace):
    with zipfile.ZipFile(path) as z:
        parts = {name: z.read(name) for name in z.namelist()}
    parts[part] = replace(parts[part].decode()).encode()
    with zipfile.ZipFile(path, 'w') as z:
        for name, data in parts.items(): z.writestr(name, data)


def test_misaligned_identity_priority_and_non_person_owner_are_flagged(tmp_path):
    path = make_register(tmp_path)
    def modify(xml):
        xml = xml.replace('<t>x-001</t>', '<t>电池类</t>').replace('<t>已转产</t>', '<t>进行中</t>')
        xml = xml.replace('<t>电池类</t></is></c><c r="D3"', '<t>一般</t></is></c><c r="D3"')
        xml = xml.replace('<t>历史负责人</t>', '<t>转量</t>')
        return xml.replace('<c r="P3"', '<c r="J3" t="inlineStr"><is><t>D-169</t></is></c><c r="P3"')
    rewrite_fixture(path, 'xl/worksheets/sheet2.xml', modify)
    package = read_register(path, tmp_path / 'assets')
    row = next(p for p in package['projects'] if p['name'] == 'D-169')
    assert row['owner'] == '' and row['category'] == '电池类' and row['priority'] == '一般'
    assert row['source']['records'][0]['fields']['项目号'] == '电池类'
    assert any('明确项目号' in note for note in row['source']['warnings'])
    assert any('负责人栏' in note for note in row['source']['warnings'])


def test_explicit_ongoing_optimization_is_not_hidden_as_completed(tmp_path):
    path = make_register(tmp_path)
    def modify(xml):
        xml = xml.replace('<t>未立项</t>', '<t>已转产</t>').replace('<t>预研</t>', '<t>量产优化</t>')
        xml = xml.replace('<c r="Q2"', '<c r="R2" t="inlineStr"><is><t>完成状态</t></is></c><c r="Q2"')
        return xml.replace('<c r="Q3"', '<c r="R3" t="inlineStr"><is><t>Ongoing</t></is></c><c r="Q3"')
    rewrite_fixture(path, 'xl/worksheets/sheet1.xml', modify)
    row = read_register(path, tmp_path / 'assets')['projects'][0]
    assert row['status'] == '正常' and row['stage'] == 'MP'
    assert len(row['tasks']) == 1


def test_register_survives_app_restart_without_demo_seed(tmp_path, monkeypatch):
    monkeypatch.setenv('APP_MODE', 'demo')
    package = read_register(make_register(tmp_path), tmp_path / 'assets')
    url = 'sqlite:///' + (tmp_path / 'persistent.db').as_posix()
    first = create_app(url, seed_demo=False)
    with TestClient(first) as client:
        import_register(first.state.Session, package)
        assert client.get('/api/workspace').json()['products'] == []
    with TestClient(create_app(url, seed_demo=False)) as client:
        workspace = client.get('/api/workspace').json()
        assert len(workspace['projects']) == 1 and len(workspace['tasks']) == 1
        assert len([c for c in workspace['categories'] if c['name'] == '电池类']) == 1
        assert len([c for c in workspace['categories'] if c['scope'] == 'report']) == 3
