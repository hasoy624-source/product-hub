import json,zipfile
from xml.etree import ElementTree as E
from fastapi.testclient import TestClient
from app.sales_import import import_sales
from app.main import create_app

def fixture(path):
    ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    root=E.Element('worksheet',xmlns=ns);data=E.SubElement(root,'sheetData')
    entries=[(3,{'B':'Model No.','C':'Jan'}),(4,{'A':'SECRET CLIENT','B':'D-100','C':10,'D':None}),(5,{'A':'OTHER CLIENT','B':'D-100','C':20,'D':0}),(6,{'B':'P-1','D':5}),(7,{'B':'G-2','C':3}),(8,{'B':'D-100吸嘴','C':2}),(9,{'B':None,'C':4}),(10,{'C':30,'D':5})]
    for index,values in entries:
        row=E.SubElement(data,'row',r=str(index))
        for col,value in values.items():
            if value is None:continue
            cell=E.SubElement(row,'c',r=f'{col}{index}')
            if isinstance(value,str):cell.set('t','inlineStr');E.SubElement(E.SubElement(cell,'is'),'t').text=value
            else:
                if index==10:E.SubElement(cell,'f').text=f'SUM({col}4:{col}5)'
                E.SubElement(cell,'v').text=str(value)
    with zipfile.ZipFile(path,'w') as archive:
        archive.writestr('xl/workbook.xml','<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Monthly Sales by Product" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        archive.writestr('xl/worksheets/sheet1.xml',E.tostring(root))

def test_import_aggregates_models_keeps_missing_months_and_excludes_customer_fields(tmp_path):
    path=tmp_path/'source.xlsx';fixture(path);original=path.read_bytes()
    data=import_sales(path,2026,2);models={row['model']:row for row in data['products']}
    assert models['D-100']['monthly_units']==[30,0] and models['D-100']['recorded_rows']==[2,1]
    assert models['P-1']['monthly_units']==[None,5]
    assert models['D-100吸嘴']['monthly_units']==[2,None]
    assert data['monthly_totals']==[39,5] and data['summary_difference']==[9,0]
    assert data['missing_model_records']==1 and data['source_rows']==6
    assert 'CLIENT' not in json.dumps(data) and path.read_bytes()==original

def test_sales_dataset_api_reads_native_snapshot_and_distinguishes_absent_from_invalid(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo');path=tmp_path/'sales.json';monkeypatch.setenv('SALES_LIFECYCLE_DATA',str(path))
    with TestClient(create_app('sqlite:///'+(tmp_path/'api.db').as_posix(),seed_demo=False)) as client:
        assert client.get('/api/sales-lifecycle').json() is None
        path.write_text('{"schema_version":1,"products":[]}',encoding='utf-8')
        assert client.get('/api/sales-lifecycle').json()['schema_version']==1
        path.write_text('broken',encoding='utf-8');assert client.get('/api/sales-lifecycle').status_code==500
