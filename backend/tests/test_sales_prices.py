import json
from fastapi.testclient import TestClient
from app.main import create_app

def setup_data(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo')
    path=tmp_path/'sales.json';path.write_text(json.dumps({'products':[{'id':'s1','model':'D-1','missing_model':False},{'id':'unknown','missing_model':True}]}))
    monkeypatch.setenv('SALES_LIFECYCLE_DATA',str(path))
    return path,'sqlite:///'+(tmp_path/'test.db').as_posix()

def test_reference_prices_persist_without_changing_imported_quantities(tmp_path,monkeypatch):
    path,url=setup_data(tmp_path,monkeypatch);original=path.read_bytes()
    with TestClient(create_app(url,seed_demo=False)) as client:
        assert client.get('/api/sales-prices').json()==[]
        payload={'currency':'USD','amount_cents':525}
        result=client.put('/api/sales-prices/s1',json=payload)
        assert result.status_code==200 and result.json()=={'product_id':'s1',**payload}
    with TestClient(create_app(url,seed_demo=False)) as client:
        assert client.get('/api/sales-prices').json()[0]['amount_cents']==525
        assert client.put('/api/sales-prices/s1',json={'currency':'CNY','amount_cents':0}).json()['amount_cents']==0
        assert client.put('/api/sales-prices/s1',json={'currency':'USD','amount_cents':None}).json() is None
        assert client.get('/api/sales-prices').json()==[]
    assert path.read_bytes()==original

def test_reference_prices_validate_unknown_models_currency_and_integer_cents(tmp_path,monkeypatch):
    _,url=setup_data(tmp_path,monkeypatch)
    with TestClient(create_app(url,seed_demo=False)) as client:
        for identifier in ['missing','unknown']:
            assert client.put('/api/sales-prices/'+identifier,json={'currency':'USD','amount_cents':525}).status_code==404
        for cents in [-1,5.25,True,'525',1000000001]:
            assert client.put('/api/sales-prices/s1',json={'currency':'USD','amount_cents':cents}).status_code==422
        assert client.put('/api/sales-prices/s1',json={'currency':'EUR','amount_cents':525}).status_code==422
        assert client.get('/api/sales-prices').json()==[]
