"""Requirement-level edge cases independent of the core API test suite."""
from fastapi.testclient import TestClient
from app.main import create_app


def test_75_percent_cross_channel_and_categories(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_MODE", "demo")
    app = create_app(f"sqlite:///{(tmp_path / 'business.db').as_posix()}", seed_demo=False)
    with TestClient(app) as client:
        a = client.post('/api/products', json={'name': '产品A', 'sku': 'a', 'category': '健康', 'owner': '甲'}).json()
        b = client.post('/api/products', json={'name': '产品B', 'sku': 'b', 'category': '家居', 'owner': '乙'}).json()
        for p, channel, amount in [(a, '独立站', 5000), (a, '线下', 2500), (b, '独立站', 2500)]:
            assert client.post('/api/sales', json={'product_id': p['id'], 'month': '2026-09', 'channel': channel, 'revenue_cents': amount}).status_code == 201
        data = client.get('/api/dashboard?month=2026-09').json()
        assert data['revenue_cents'] == 10000
        assert data['top_product_share'] == 75
        assert {row['category']: row['share'] for row in data['category_sales']} == {'健康': 75, '家居': 25}


def test_exact_threshold_and_zero_data_report(tmp_path, monkeypatch):
    monkeypatch.setenv("APP_MODE", "demo")
    app = create_app(f"sqlite:///{(tmp_path / 'threshold.db').as_posix()}", seed_demo=False)
    with TestClient(app) as client:
        content = client.post('/api/reports/generate', json={'month': '2026-09'}).json()['content']
        assert '暂无足够销售数据判断集中风险' in content
        for index, amount in enumerate([6000, 4000]):
            p = client.post('/api/products', json={'name': f'产品{index}', 'sku': str(index), 'category': '分类', 'owner': '负责人'}).json()
            client.post('/api/sales', json={'product_id': p['id'], 'month': '2026-09', 'revenue_cents': amount})
        data = client.get('/api/dashboard?month=2026-09').json()
        assert data['top_product_share'] == data['risk_threshold'] == 60
        content = client.post('/api/reports/generate', json={'month': '2026-09'}).json()['content']
        assert '达到或超过 60%' in content
