import hashlib,json
from fastapi.testclient import TestClient
from app.main import create_app
from app.product_taxonomy import default_config,validate_config,classified_type

def setup(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo');path=tmp_path/'lifecycle.json';key='D-1'
    path.write_text(json.dumps({'schema_version':1,'year':2026,'through_month':1,'blank_policy':'missing','months':['2026-01'],'products':[{'id':'sales-'+hashlib.sha256(key.encode()).hexdigest()[:20],'model':key,'category':'电池类','monthly_units':[10],'recorded_rows':[1],'source_rows':1,'missing_model':False}],'source_rows':1,'missing_model_records':0,'monthly_totals':[10],'summary_difference':[None],'revision':'base'}));monkeypatch.setenv('SALES_LIFECYCLE_DATA',str(path));return path,'sqlite:///'+(tmp_path/'tax.db').as_posix()
def changed():
    config=default_config();config['categories'].append({'id':'ceramic','name':'陶瓷类','tone':'rose','active':True,'order':5,'aliases':[]});config['rules'].append({'id':'z-prefix','kind':'prefix','value':'Z-','category_id':'ceramic','priority':100,'active':True});return config

def test_taxonomy_preview_commit_restart_and_new_data_use_operator_rules(tmp_path,monkeypatch):
    path,url=setup(tmp_path,monkeypatch);original=path.read_bytes()
    with TestClient(create_app(url,seed_demo=False)) as client:
        view=client.get('/api/product-taxonomy').json();config=changed();body={'revision':view['revision'],'config':config}
        assert client.post('/api/product-taxonomy/preview',json=body).json()['count']==0
        saved=client.put('/api/product-taxonomy',json=body);assert saved.status_code==200 and saved.json()['can_undo']
        assert client.put('/api/product-taxonomy',json=body).status_code==409
    with TestClient(create_app(url,seed_demo=False)) as client:
        view=client.get('/api/product-taxonomy').json();assert any(row['name']=='陶瓷类' for row in view['config']['categories'])
        sales=client.get('/api/sales-data').json();result=client.post('/api/sales-data/commit',json={'revision':sales['revision'],'mode':'replace','source':'manual','rows':[{'year':2027,'month':1,'model':'Z-1','units':7}]}).json();assert result['history'][0]['products'][0]['category']=='陶瓷类'
        restored=client.post('/api/product-taxonomy/undo',json={'revision':view['revision']}).json();assert not restored['can_undo']
        assert client.get('/api/sales-history').json()[0]['products'][0]['category']=='待分类'
    assert path.read_bytes()==original

def test_rename_and_override_change_category_only_and_preserve_quantities(tmp_path,monkeypatch):
    path,url=setup(tmp_path,monkeypatch);original=path.read_bytes()
    with TestClient(create_app(url,seed_demo=False)) as client:
        view=client.get('/api/product-taxonomy').json();config=view['config'];battery=next(row for row in config['categories'] if row['id']=='battery');battery['aliases']=['电池类'];battery['name']='电池产品'
        body={'revision':view['revision'],'config':config};preview=client.post('/api/product-taxonomy/preview',json=body).json();assert preview['changes'][0]['after']=='电池产品'
        assert client.put('/api/product-taxonomy',json=body).status_code==200
        data=client.get('/api/sales-history').json()[0];assert data['products'][0]['category']=='电池产品' and data['monthly_totals']==[10]
        assert client.get('/api/sales-lifecycle').json()['products'][0]['category']=='电池产品'
        product=client.post('/api/products',json={'name':'样品','sku':'D-1','category':'电池类','owner':'测试'}).json()
        assert client.post('/api/sales',json={'product_id':product['id'],'month':'2026-01','revenue_cents':100,'units':1}).status_code==201
        assert client.get('/api/workspace').json()['products'][0]['category']=='电池产品'
        summary=client.get('/api/dashboard?month=2026-01').json()
        assert summary['category_sales'][0]['category']=='电池产品' and summary['revenue_cents']==100
    assert path.read_bytes()==original

def test_configuration_validation_keeps_fallback_and_rejects_ambiguous_patterns():
    config=changed();config['schema_version']=True
    try:validate_config(config);assert False
    except Exception as error:assert error.status_code==422
    config=changed();config['rules'].append({**config['rules'][0],'id':'duplicate'})
    try:validate_config(config);assert False
    except Exception as error:assert error.status_code==422
    config=changed();next(row for row in config['categories'] if row['id']==config['fallback_id'])['active']=False
    try:validate_config(config);assert False
    except Exception as error:assert error.status_code==422
    config=changed();config['overrides']=[{'model':'122N','category_id':'ceramic'}]
    assert classified_type('122n',validate_config(config))['name']=='陶瓷类'
