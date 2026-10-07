"""Daily Pages snapshot collection, runnable without a database or secrets."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
from .market_crawler import crawl_source, normalize_url


def sources_config_path():
    if os.getenv('MARKET_SOURCES_FILE'): return Path(os.environ['MARKET_SOURCES_FILE'])
    for parent in [Path(__file__).resolve().parents[2],Path(__file__).resolve().parents[1]]:
        candidate=parent/'config/market-sources.json'
        if candidate.is_file():return candidate
    raise FileNotFoundError('market-sources.json')


def empty_snapshot():
    return {'schema_version':1, 'updated_at':'', 'sources':[], 'reviews':[], 'products':[], 'runs':[], 'schedule':{'timezone':'Asia/Shanghai','daily_time':'09:00'}, 'available':True}


def review_signal(review, source_name):
    return {'id':review['id'], 'kind':'独立站评价', 'brand':review['product_title'], 'title':f"{review['rating']} 星 · {review['title'] or review['product_title']}", 'content':review['content'], 'sentiment':review['sentiment'], 'source_url':review['source_url'], 'occurred_on':review['published_on'], 'review_id':review['id'], 'source_name':source_name}


def sync_snapshot(config, previous=None, client=None, observed_at=None):
    previous = previous or empty_snapshot()
    now = observed_at or datetime.now(timezone.utc).isoformat(timespec='seconds')
    reviews = {row['id']:row for row in previous.get('reviews',[])}
    old_sources = {row['id']:row for row in previous.get('sources',[])}
    products = {row['source_id']+'|'+row['url']:row for row in previous.get('products',[])}
    runs = list(previous.get('runs',[])); sources=[]
    for supplied in config['sources']:
        source = {**old_sources.get(supplied['id'],{}),**supplied}
        source['collection_url'] = normalize_url(source['collection_url'])
        if source.get('enabled',True):
            result = crawl_source(source,client,now)
            new = 0
            for row in result['reviews']:
                if row['id'] in reviews: row['first_seen_at'] = reviews[row['id']]['first_seen_at']
                else: new += 1
                reviews[row['id']] = row
            for row in result['products']: products[source['id']+'|'+row['url']] = {**row,'source_id':source['id']}
            run = result['run']; run['new_reviews']=new; runs.insert(0,run)
            source.update(last_run_at=run['finished_at'],last_status=run['status'],message=run['message'],retry_after=run['retry_after'])
            if run['status'] == 'success': source['last_success_at'] = run['finished_at']
        source['review_count'] = sum(row['source_id']==source['id'] for row in reviews.values())
        source['product_count'] = sum(row['source_id']==source['id'] and row.get('status')=='success' for row in products.values())
        sources.append(source)
    return {'schema_version':1,'updated_at':now,'sources':sources,'reviews':sorted(reviews.values(),key=lambda r:(r['published_on'],r['first_seen_at'],r['id']),reverse=True),'products':list(products.values()),'runs':runs[:100],'schedule':{'timezone':config.get('timezone','Asia/Shanghai'),'daily_time':config.get('daily_time','09:00')},'available':True}


def write_snapshot(path, snapshot):
    path=Path(path).resolve();path.parent.mkdir(parents=True,exist_ok=True)
    payload=json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n'
    temporary=path.with_suffix('.json.tmp');temporary.write_text(payload,encoding='utf-8',newline='\n');temporary.replace(path)


def main():
    root=Path(__file__).resolve().parents[2]
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources',type=Path,default=sources_config_path())
    parser.add_argument('--output',type=Path,default=root/'frontend/public/market/latest.json')
    args=parser.parse_args()
    config=json.loads(args.sources.read_text(encoding='utf-8'))
    previous=json.loads(args.output.read_text(encoding='utf-8')) if args.output.is_file() else empty_snapshot()
    result=sync_snapshot(config,previous)
    write_snapshot(args.output,result)
    for source in result['sources']:
        print(f"CRAWL: source={source['id']}; status={source.get('last_status','pending')}; products={source['product_count']}; reviews={source['review_count']}; message={source.get('message','')}",flush=True)
    print(f"SNAPSHOT: sources={len(result['sources'])}; reviews={len(result['reviews'])}; sha256={hashlib.sha256(args.output.read_bytes()).hexdigest()}; exit=0",flush=True)


if __name__=='__main__': main()
