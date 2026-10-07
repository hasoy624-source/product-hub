from datetime import datetime, timezone
import io
import json
from urllib.error import HTTPError
from urllib.request import Request
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import create_app
from app.market import execute_source, next_daily, tick_market
from app.market_crawler import CrawlError, PublicClient, PublicRedirects, crawl_source, normalize_review, normalize_url, parse_reviews, collection_links
from app.market_sync import sync_snapshot
from app.models import MarketSource, MarketReview, MarketRun, Signal

SOURCE={'id':'pulsar-puffco','name':'Pulsar','collection_url':'https://shop.example/collections/puffco?page=2','enabled':True,'max_products':80,'max_collection_pages':5,'max_review_pages':10}
PRODUCT={'url':'https://shop.example/products/peak','title':'Peak'}
COLLECTION='<div id="ProductGridContainer"><a href="/collections/puffco/products/peak">Peak</a><a href="/collections/puffco/products/peak?variant=2">Peak Blue</a><a href="/collections/puffco?page=1">1</a><a href="/products/promo">Promo</a></div>'
PAGE='''<script type="application/ld+json">{"@type":"Product","name":"Puffco Peak"}</script><div id="judgeme_product_reviews" data-id="123"><div class="jdgm-rev" data-review-id="review-uuid-1"><span class="jdgm-rev__rating" data-score="2"></span><span class="jdgm-rev__timestamp" data-content="2026-10-01 11:20:00 UTC"></span><b class="jdgm-rev__title">Battery issue</b><div class="jdgm-rev__body"><p>Charging stopped.</p><p>It leaks too.</p></div><span class="jdgm-rev__buyer-badge">Verified</span><span class="jdgm-rev__author">Do not collect</span></div></div>'''

class FakeClient:
    def __init__(self,product=PAGE):self.calls=[];self.product=product
    def get(self,url,headers=None):
        self.calls.append(url)
        if '/collections/' in url:return COLLECTION
        return self.product

@pytest.mark.parametrize('url',['http://example.com/collections/a','https://user:pass@example.com/','https://localhost/','https://127.0.0.1/','https://[::1]/','https://[fd00::1]/','https://x.local/','https://example.com:8080/'])
def test_rejects_non_public_source_urls(url):
    with pytest.raises(ValueError):normalize_url(url)

def test_normalizes_user_link_punctuation_and_filters_tracking():
    assert normalize_url('https://www.pulsarshop.com/collections/puffco?page=2，')=='https://www.pulsarshop.com/collections/puffco?page=2'
    assert normalize_url('https://shop.example/collections/x?page=2&tracking=secret#hash')=='https://shop.example/collections/x?page=2'

def test_collection_pagination_deduplicates_variants_and_excludes_promo():
    products,pages=collection_links(COLLECTION,SOURCE['collection_url'])
    assert products==[{'url':PRODUCT['url'],'title':'Peak'}]
    assert pages==['https://shop.example/collections/puffco?page=1']

def test_native_review_parsing_keeps_content_rating_date_and_not_identity():
    rows=parse_reviews(PAGE);assert len(rows)==1
    review=normalize_review(rows[0],SOURCE,PRODUCT,'2026-10-07T01:00:00+00:00')
    assert review['rating']==2 and review['sentiment']=='负向'
    assert review['content']=='Charging stopped.\nIt leaks too.'
    assert review['published_on']=='2026-10-01'
    assert review['verified_purchase']
    assert set(review['tags'])=={'续航','漏液'}
    assert 'author' not in review and 'email' not in review

def test_structured_reviews_keep_unknown_date_and_fractional_rating():
    html='<script type="application/ld+json">{"@type":"Product","review":{"@type":"Review","name":"OK","reviewBody":"Works","reviewRating":{"ratingValue":"4.5"},"datePublished":"yesterday"}}</script>'
    review=normalize_review(parse_reviews(html)[0],SOURCE,PRODUCT,'2026-10-07T01:00:00Z')
    assert review['rating']==4.5 and review['published_on']==''
    assert review['published_raw']=='yesterday'

def test_crawl_is_finite_and_dedupes_products_and_reviews():
    client=FakeClient();result=crawl_source(SOURCE,client,'2026-10-07T01:00:00Z')
    assert result['run']['status']=='success'
    assert result['run']['products_scanned']==1 and len(result['reviews'])==1
    assert len(client.calls)==3

def test_explicit_empty_widget_is_zero_but_missing_adapter_is_not():
    empty=FakeClient('<div id="judgeme_product_reviews" data-empty-state="empty_widget">No reviews</div>')
    assert crawl_source(SOURCE,empty)['run']['status']=='success'
    result=crawl_source(SOURCE,FakeClient('<h1>Unknown review platform</h1>'))
    assert result['run']['status']=='partial'
    assert result['run']['products_scanned']==0
    assert result['products'][0]['status']=='needs_adapter'

def test_rate_limit_preserves_prior_reviews_and_exposes_retry_status():
    initial=sync_snapshot({'sources':[SOURCE]},client=FakeClient(),observed_at='2026-10-07T01:00:00Z')
    class Limited:
        def get(self,url,headers=None):raise CrawlError('HTTP 429','rate_limited',120)
    second=sync_snapshot({'sources':[SOURCE]},initial,Limited(),'2026-10-08T01:00:00Z')
    assert second['reviews']==initial['reviews']
    assert second['sources'][0]['last_status']=='rate_limited'
    assert second['runs'][0]['retry_after']==120
    assert second['runs'][0]['new_reviews']==0

def test_repeated_runs_do_not_create_duplicate_reviews():
    first=sync_snapshot({'sources':[SOURCE]},client=FakeClient(),observed_at='2026-10-07T01:00:00Z')
    second=sync_snapshot({'sources':[SOURCE]},first,FakeClient(),'2026-10-08T01:00:00Z')
    assert len(second['reviews'])==1 and second['runs'][0]['new_reviews']==0
    assert second['reviews'][0]['first_seen_at']=='2026-10-07T01:00:00Z'
    assert second['reviews'][0]['last_seen_at']=='2026-10-08T01:00:00Z'

def test_private_dns_and_cross_origin_redirect_are_rejected(monkeypatch):
    monkeypatch.setattr('app.market_crawler.socket.getaddrinfo',lambda *a,**k:[(2,1,6,'',('127.0.0.1',443))])
    with pytest.raises(ValueError):PublicClient(0).get('https://shop.example/products/a')
    with pytest.raises(ValueError):PublicRedirects().redirect_request(Request('https://shop.example/'),None,302,'',{},'https://other.example/private')

def test_429_is_not_retried_immediately(monkeypatch):
    monkeypatch.setattr('app.market_crawler.socket.getaddrinfo',lambda *a,**k:[(2,1,6,'',('93.184.216.34',443))])
    class Opener:
        calls=0
        def open(self,request,timeout):
            self.calls+=1;raise HTTPError(request.full_url,429,'Too many',{'Retry-After':'90'},io.BytesIO(b''))
    client=PublicClient(0);opener=Opener();client.opener=opener
    with pytest.raises(CrawlError) as result:client.get('https://shop.example/products/a',robots=False)
    assert result.value.retry_after==90 and opener.calls==1

def test_daily_schedule_uses_shanghai_0900():
    assert next_daily(datetime(2026,10,7,0,59,tzinfo=timezone.utc))=='2026-10-07T01:00:00+00:00'
    assert next_daily(datetime(2026,10,7,1,0,tzinfo=timezone.utc))=='2026-10-08T01:00:00+00:00'

def test_native_source_api_deduplication_and_persistent_review_signal_link(tmp_path,monkeypatch):
    monkeypatch.setenv('APP_MODE','demo')
    app=create_app('sqlite:///'+(tmp_path/'market.db').as_posix(),seed_demo=False)
    with TestClient(app) as client:
        assert client.get('/api/market').json()['sources'][0]['id']=='pulsar-puffco'
        payload={'name':'Test shop','collection_url':SOURCE['collection_url']}
        response=client.post('/api/market/sources',json=payload);assert response.status_code==201
        identifier=response.json()['id']
        assert client.post('/api/market/sources',json=payload).status_code==409
        assert client.post('/api/market/sources',json={**payload,'collection_url':SOURCE['collection_url'].replace('page=2','page=1')}).status_code==409
        assert client.patch('/api/market/sources/pulsar-puffco',json=payload).status_code==409
        assert client.post('/api/market/sources',json={**payload,'collection_url':'https://127.0.0.1/'}).status_code==422
        execute_source(app.state.Session,identifier,FakeClient())
        execute_source(app.state.Session,identifier,FakeClient())
        data=client.get('/api/market').json()
        assert len(data['reviews'])==1 and len(data['runs'])==2
        assert data['sources'][1]['product_count']==1
        signal=client.get('/api/workspace').json()['signals'][0]
        assert signal['id']==data['reviews'][0]['id'] and signal['kind']=='独立站评价' and signal['sentiment']=='负向'
        assert client.patch('/api/market/sources/'+identifier,json={**payload,'enabled':False}).status_code==200
        with app.state.Session() as session:
            assert len(list(session.scalars(select(MarketReview))))==1
            assert len(list(session.scalars(select(MarketRun))))==2
        assert tick_market(app.state.Session)==[]
