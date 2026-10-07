"""Persistent source management, run history and public-review signal links."""
from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo
from fastapi import BackgroundTasks, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from .market_crawler import normalize_url
from .market_sync import sync_snapshot, empty_snapshot, review_signal, sources_config_path
from .models import MarketSource, MarketReview, MarketRun, MarketProduct, Signal, serialize
from .services import stamp, utcnow


def next_daily(now=None):
    local=(now or utcnow()).astimezone(ZoneInfo('Asia/Shanghai'))
    target=local.replace(hour=9,minute=0,second=0,microsecond=0)
    if target<=local:target+=timedelta(days=1)
    return stamp(target)


class SourceIn(BaseModel):
    model_config={'str_strip_whitespace':True,'extra':'forbid'}
    name: str = Field(min_length=1,max_length=200)
    collection_url: str = Field(max_length=2000)
    enabled: bool = True
    interval_hours: int = Field(default=24,ge=1,le=720)
    max_products: int = Field(default=80,ge=1,le=100)
    max_collection_pages: int = Field(default=5,ge=1,le=10)
    max_review_pages: int = Field(default=10,ge=1,le=20)


def source_values(row):
    data=serialize(row);data.update(data.pop('config',{}));return data


def market_snapshot(factory):
    result=empty_snapshot()
    with factory() as session:
        result['sources']=[source_values(row) for row in session.scalars(select(MarketSource))]
        result['reviews']=[row.payload for row in session.scalars(select(MarketReview))]
        result['products']=[row.payload for row in session.scalars(select(MarketProduct))]
        result['runs']=[row.payload for row in session.scalars(select(MarketRun).order_by(MarketRun.started_at.desc()).limit(100))]
    for source in result['sources']:
        source['review_count']=sum(row['source_id']==source['id'] for row in result['reviews'])
        source['product_count']=sum(row['source_id']==source['id'] and row.get('status')=='success' for row in result['products'])
    result['updated_at']=max((r.get('finished_at','') for r in result['runs']),default='')
    return result


def ensure_sources(session):
    config=json.loads(sources_config_path().read_text(encoding='utf-8'))
    for item in config['sources']:
        if not session.get(MarketSource,item['id']):
            session.add(MarketSource(id=item['id'],name=item['name'],collection_url=normalize_url(item['collection_url']),enabled=item.get('enabled',True),interval_hours=item.get('interval_hours',24),config={k:item[k] for k in ['max_products','max_collection_pages','max_review_pages']},next_run_at=next_daily()))


def execute_source(factory, identifier, client=None):
    with factory() as session,session.begin():
        claimed=session.execute(update(MarketSource).where(MarketSource.id==identifier,MarketSource.last_status!='running').values(last_status='running',last_run_at=stamp(),message='正在采集'))
        if claimed.rowcount!=1:return None
        source=source_values(session.get(MarketSource,identifier))
        source['enabled']=True  # Manual runs may collect a paused automatic source.
    try:
        previous=market_snapshot(factory)
        result=sync_snapshot({'sources':[source]},previous,client)
        run=result['runs'][0];runtime=result['sources'][0]
        with factory() as session,session.begin():
            row=session.get(MarketSource,identifier)
            row.last_status=run['status'];row.message=run['message'];row.last_run_at=run['finished_at']
            row.next_run_at=next_daily() if row.interval_hours==24 else stamp(utcnow()+timedelta(hours=row.interval_hours))
            for product in result['products']:
                if product['source_id']!=identifier:continue
                product_id=hashlib.sha256((identifier+'|'+product['url']).encode()).hexdigest()
                record=session.get(MarketProduct,product_id)
                if record:record.payload=product
                else:session.add(MarketProduct(id=product_id,source_id=identifier,payload=product))
            for review in result['reviews']:
                if review['source_id']!=identifier:continue
                existing=session.get(MarketReview,review['id'])
                if existing:existing.payload=review
                else:session.add(MarketReview(id=review['id'],source_id=identifier,payload=review))
                signal=review_signal(review,row.name);signal.pop('review_id');signal.pop('source_name')
                current=session.get(Signal,signal['id'])
                if current:
                    for key,value in signal.items():setattr(current,key,value)
                else:session.add(Signal(**signal))
            session.add(MarketRun(id=run['id'],source_id=identifier,started_at=run['started_at'],payload=run))
        return run
    except Exception as error:
        with factory() as session,session.begin():
            row=session.get(MarketSource,identifier);row.last_status='failed';row.message='采集执行异常：'+type(error).__name__;row.next_run_at=next_daily()
        raise


def tick_market(factory):
    with factory() as session,session.begin():
        ensure_sources(session)
        session.execute(update(MarketSource).where(MarketSource.last_status=='running',MarketSource.last_run_at<stamp(utcnow()-timedelta(hours=2))).values(last_status='failed',message='上次采集已中断，等待重试',next_run_at=stamp()))
        ids=list(session.scalars(select(MarketSource.id).where(MarketSource.enabled.is_(True),MarketSource.next_run_at<=stamp(),MarketSource.last_status!='running')))
    return [execute_source(factory,identifier) for identifier in ids]


def register_market_routes(app,factory):
    @app.get('/api/market')
    def read_market():return market_snapshot(factory)

    @app.post('/api/market/sources',status_code=201)
    def add_source(payload:SourceIn):
        values=payload.model_dump()
        try:url=normalize_url(values['collection_url'])
        except ValueError as error:raise HTTPException(422,str(error))
        identity=url.split('?')[0]
        identifier='source-'+hashlib.sha256(identity.encode()).hexdigest()[:20]
        with factory() as session,session.begin():
            if any(row.collection_url.split('?')[0]==identity for row in session.scalars(select(MarketSource))) or session.get(MarketSource,identifier):raise HTTPException(409,'该采集来源已存在')
            row=MarketSource(id=identifier,name=values['name'].strip(),collection_url=url,enabled=values['enabled'],interval_hours=values['interval_hours'],config={k:values[k] for k in ['max_products','max_collection_pages','max_review_pages']},next_run_at=next_daily())
            session.add(row);session.flush();return source_values(row)

    @app.patch('/api/market/sources/{identifier}')
    def patch_source(identifier:str,payload:SourceIn):
        values=payload.model_dump()
        try:url=normalize_url(values['collection_url'])
        except ValueError as error:raise HTTPException(422,str(error))
        with factory() as session,session.begin():
            row=session.get(MarketSource,identifier)
            if not row:raise HTTPException(404,'采集来源不存在')
            if row.last_status=='running':raise HTTPException(409,'来源正在采集，请稍后修改')
            if any(other.id!=identifier and other.collection_url.split('?')[0]==url.split('?')[0] for other in session.scalars(select(MarketSource))):raise HTTPException(409,'该采集来源已存在')
            row.name=values['name'].strip();row.collection_url=url;row.enabled=values['enabled'];row.interval_hours=values['interval_hours'];row.config={k:values[k] for k in ['max_products','max_collection_pages','max_review_pages']}
            row.next_run_at=next_daily();return source_values(row)

    @app.post('/api/market/sources/{identifier}/run',status_code=202)
    def run_source(identifier:str,tasks:BackgroundTasks):
        with factory() as session:
            row=session.get(MarketSource,identifier)
            if not row:raise HTTPException(404,'采集来源不存在')
            if row.last_status=='running':raise HTTPException(409,'此来源正在采集')
        tasks.add_task(execute_source,factory,identifier)
        return {'status':'queued','source_id':identifier}
