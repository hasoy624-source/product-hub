import hashlib,json
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import create_app

def setup(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo');path=tmp_path/'lifecycle.json'
    data={'schema_version':1,'year':2026,'through_month':2,'blank_policy':'missing','months':['2026-01','2026-02'],'products':[{'id':'sales-'+hashlib.sha256(b'D-1').hexdigest()[:20],'model':'D-1','category':'电池类','monthly_units':[10,None],'recorded_rows':[1,0],'source_rows':1,'missing_model':False}],'source_rows':1,'missing_model_records':0,'monthly_totals':[10,0],'summary_difference':[None,None],'revision':'original'}
    path.write_text(json.dumps(data));monkeypatch.setenv('SALES_LIFECYCLE_DATA',str(path));return path,'sqlite:///'+(tmp_path/'data.db').as_posix()

def row(units,month=1,year=2026,model='D-1'):return {'year':year,'month':month,'model':model,'units':units}
def batch(revision,rows,mode='replace'):return {'revision':revision,'rows':rows,'mode':mode,'source':'excel'}

def test_preview_is_read_only_commit_replaces_totals_and_persists_across_restart(tmp_path,monkeypatch):
    path,url=setup(tmp_path,monkeypatch);original=path.read_bytes()
    with TestClient(create_app(url,seed_demo=False)) as client:
        initial=client.get('/api/sales-data').json();payload=batch(initial['revision'],[row(20)])
        preview=client.post('/api/sales-data/preview',json=payload).json();assert preview['changes'][0]['before']==10
        assert client.get('/api/sales-history').json()[0]['monthly_totals']==[10,0]
        result=client.post('/api/sales-data/commit',json=payload).json();assert result['history'][0]['monthly_totals']==[20,0]
        assert client.post('/api/sales-data/commit',json=payload).status_code==409
    with TestClient(create_app(url,seed_demo=False)) as client:
        state=client.get('/api/sales-data').json();assert state['history'][0]['monthly_totals']==[20,0]
        repeat=client.post('/api/sales-data/commit',json=batch(state['revision'],[row(20)])).json()
        assert repeat['result']['changed']==0 and repeat['revision']==state['revision']
        assert len(repeat['changes'])==1
    assert path.read_bytes()==original

def test_fill_mode_zero_missing_new_year_and_undo_keep_source_snapshot_unchanged(tmp_path,monkeypatch):
    path,url=setup(tmp_path,monkeypatch);original=path.read_bytes()
    with TestClient(create_app(url,seed_demo=False)) as client:
        state=client.get('/api/sales-data').json()
        state=client.post('/api/sales-data/commit',json=batch(state['revision'],[row(99),row(0,2)],'fill')).json()
        assert state['result']['skipped']==1 and state['history'][0]['products'][0]['monthly_units']==[10,0]
        state=client.post('/api/sales-data/commit',json=batch(state['revision'],[row(7,10,2027,'P-NEW')])).json()
        assert state['history'][0]['year']==2027 and state['history'][0]['monthly_totals']==[0]*9+[7]
        identifier=state['history'][0]['products'][0]['id']
        assert client.put('/api/sales-prices/'+identifier,json={'currency':'USD','amount_cents':700}).status_code==200
        latest=state['changes'][0]['id']
        assert client.post('/api/sales-data/changes/'+state['changes'][1]['id']+'/undo',json={'revision':state['revision']}).status_code==409
        state=client.post('/api/sales-data/changes/'+latest+'/undo',json={'revision':state['revision']}).json()
        assert [data['year'] for data in state['history']]==[2026]
        state=client.post('/api/sales-data/commit',json=batch(state['revision'],[row(None)])).json()
        assert state['history'][0]['products'][0]['monthly_units']==[None,0]
    assert path.read_bytes()==original

def test_atomic_validation_rejects_duplicate_bad_quantity_and_stale_version(tmp_path,monkeypatch):
    _,url=setup(tmp_path,monkeypatch)
    with TestClient(create_app(url,seed_demo=False)) as client:
        state=client.get('/api/sales-data').json()
        for values in [[row(1),row(2)],[row(-1)],[row(1.5)],[row(True)],[row('10')],[row(1,13)]]:
            assert client.post('/api/sales-data/commit',json=batch(state['revision'],values)).status_code==422
        assert client.get('/api/sales-data').json()['revision']==state['revision']
        assert client.post('/api/sales-data/preview',json=batch('old',[row(10)])).status_code==409

def test_public_sales_data_remains_unchanged_and_no_client_columns_are_accepted_in_business_records(tmp_path,monkeypatch):
    _,url=setup(tmp_path,monkeypatch)
    with TestClient(create_app(url,seed_demo=False)) as client:
        state=client.get('/api/sales-data').json()
        result=client.post('/api/sales-data/commit',json=batch(state['revision'],[{**row(20),'customer_code':'PRIVATE','notes':'PRIVATE'}])).json()
        assert 'PRIVATE' not in json.dumps(result)

def test_partial_coverage_survives_other_model_updates(tmp_path,monkeypatch):
    path,url=setup(tmp_path,monkeypatch);data=json.loads(path.read_text());data['products'][0]['source_rows']=2;data['products'][0]['recorded_rows']=[1,1];data['products'][0]['monthly_units']=[10,20];path.write_text(json.dumps(data))
    with TestClient(create_app(url,seed_demo=False)) as client:
        state=client.get('/api/sales-data').json();state=client.post('/api/sales-data/commit',json=batch(state['revision'],[row(7,2,model='P-NEW')])).json()
        unchanged=next(row for row in state['history'][0]['products'] if row['model']=='D-1')
        assert unchanged['source_rows']==2 and unchanged['recorded_rows']==[1,1] and 'aggregate_months' not in unchanged

def test_undo_can_continue_beyond_twenty_displayed_changes(tmp_path,monkeypatch):
    _,url=setup(tmp_path,monkeypatch)
    with TestClient(create_app(url,seed_demo=False)) as client:
        state=client.get('/api/sales-data').json()
        for i in range(1,22):state=client.post('/api/sales-data/commit',json=batch(state['revision'],[row(10+i)])).json()
        assert len(state['changes'])==20
        for _ in range(21):
            assert state['latest_undoable'];state=client.post('/api/sales-data/changes/'+state['latest_undoable']['id']+'/undo',json={'revision':state['revision']}).json()
        assert state['latest_undoable'] is None and state['history'][0]['products'][0]['monthly_units'][0]==10
