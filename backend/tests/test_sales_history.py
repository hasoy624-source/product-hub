import json,zipfile
from xml.etree import ElementTree as E
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import create_app
from app.sales_import import import_sales
from test_sales_lifecycle import fixture

def test_shifted_2025_columns_stop_before_repeated_analysis_and_leave_source_unchanged(tmp_path):
    source=tmp_path/'source.xlsx';fixture(source)
    with zipfile.ZipFile(source) as archive:files={name:archive.read(name) for name in archive.namelist()}
    ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    xml=E.fromstring(files['xl/worksheets/sheet1.xml'])
    for cell in xml.findall('.//m:c',ns):
        reference=cell.attrib['r'];cell.attrib['r']=chr(ord(reference[0])+1)+reference[1:]
        if reference=='B3':cell.find('m:is/m:t',ns).text=' '
    duplicate=E.SubElement(xml.find('m:sheetData',ns),'{'+ns['m']+'}row',r='11')
    E.SubElement(E.SubElement(duplicate,'{'+ns['m']+'}c',r='D11'),'{'+ns['m']+'}v').text='999999'
    files['xl/worksheets/sheet1.xml']=E.tostring(xml)
    with zipfile.ZipFile(source,'w') as archive:
        for name,content in files.items():archive.writestr(name,content)
    original=source.read_bytes();data=import_sales(source,2025,2)
    assert data['monthly_totals']==[39,5] and source.read_bytes()==original
    assert data['source_rows']==6

def test_history_api_keeps_legacy_latest_dataset_and_accepts_prior_year_price_models(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo');base=tmp_path/'lifecycle.json'
    base.write_text(json.dumps({'year':2026,'products':[{'id':'new','missing_model':False}]}));old=tmp_path/'lifecycle-2025.json'
    old.write_text(json.dumps({'year':2025,'products':[{'id':'old','missing_model':False}]}))
    index=tmp_path/'history.json';index.write_text(json.dumps({'schema_version':1,'years':[{'year':2025,'file':old.name},{'year':2026,'file':base.name}]}))
    monkeypatch.setenv('SALES_LIFECYCLE_DATA',str(base))
    with TestClient(create_app('sqlite:///'+(tmp_path/'api.db').as_posix(),seed_demo=False)) as client:
        assert client.get('/api/sales-lifecycle').json()['year']==2026
        assert [data['year'] for data in client.get('/api/sales-history').json()]==[2026,2025]
        assert client.put('/api/sales-prices/old',json={'currency':'USD','amount_cents':700}).status_code==200
        old.unlink();assert client.get('/api/sales-history').status_code==500
        index.write_text(json.dumps({'schema_version':1,'years':[{'year':2025,'file':'../private.json'}]}));assert client.get('/api/sales-history').status_code==500
        index.unlink();assert len(client.get('/api/sales-history').json())==1

def test_published_2025_totals_reconcile_primary_records_and_exclude_private_customer_data():
    path=Path(__file__).resolve().parents[2]/'frontend/public/sales/lifecycle-2025.json';data=json.loads(path.read_text(encoding='utf-8'))
    assert sum(data['monthly_totals'])==3039874 and sum(data['monthly_totals'][:9])==2124328
    assert data['source_rows']==199 and len(data['products'])==127
    assert data['summary_difference'][8]==8508
    assert 'CC0002' not in json.dumps(data) and 'Notes' not in json.dumps(data)
