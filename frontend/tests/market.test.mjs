import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { filterReviews, reviewSignals, mergeReviewSignals, publicMarketSnapshot, clearMarketCache, crawlStatus } from '../src/market-model.ts'
const reviews=[{id:'review-a',source_id:'s1',product_title:'Peak',title:'Battery issue',content:'Cannot charge',rating:2,sentiment:'负向',published_on:'2026-10-01',source_url:'https://shop.example/products/peak',tags:['续航']},{id:'review-b',source_id:'s2',product_title:'Pivot',title:'Great',content:'Works',rating:5,sentiment:'正向',published_on:'',source_url:'https://shop.example/products/pivot',tags:[]}]
const snapshot={schema_version:1,updated_at:'2026-10-07T01:00:00Z',available:true,sources:[],reviews,products:[],runs:[],schedule:{timezone:'Asia/Shanghai',daily_time:'09:00'}}
test('reviews filter by source, rating, product and issue keyword',()=>{
  assert.equal(filterReviews(reviews,'s1').length,1)
  assert.equal(filterReviews(reviews,'all','low')[0].id,'review-a')
  assert.equal(filterReviews(reviews,'all','5')[0].id,'review-b')
  for(const query of ['battery','PEAK','续航']) assert.equal(filterReviews(reviews,'all','all',query)[0].id,'review-a')
  assert.equal(filterReviews(reviews,'all','all','not-found').length,0)
})
test('review signals preserve rating-based sentiment, source and unknown dates',()=>{
  const signals=reviewSignals(snapshot)
  assert.equal(signals[0].kind,'独立站评价');assert.equal(signals[0].sentiment,'负向')
  assert.equal(signals[1].occurred_on,'');assert.equal(signals[0].source_url,reviews[0].source_url)
  assert.equal(mergeReviewSignals([signals[0],{id:'manual'}],snapshot).length,3)
})
test('published review fetch follows Pages base and errors are not fake zero-review success',async()=>{
  clearMarketCache();let url
  const actual=await publicMarketSnapshot('/product-hub/',async(target)=>{url=target;return {ok:true,json:async()=>snapshot}})
  assert.equal(url,'/product-hub/market/latest.json');assert.equal(actual.reviews.length,2)
  clearMarketCache()
  const failed=await publicMarketSnapshot('/product-hub/',async()=>({ok:false,status:503}))
  assert.equal(failed.available,false);assert.match(failed.error,/503/)
})
test('source and runtime tabs expose true state and static Actions instead of fake browser crawling',()=>{
  const ui=readFileSync(new URL('../src/MarketIntelligence.tsx',import.meta.url),'utf8')
  for(const label of ['评价库','采集站点','运行记录','人工情报','查看原评价','已验证购买','每日','采集任务'])assert.ok(ui.includes(label))
  assert.ok(ui.includes('publishedPreviewEnabled'))
  assert.equal(crawlStatus.rate_limited,'等待重试')
  assert.ok(ui.includes('tabIndex={tab===value?0:-1}'))
  const workflow=readFileSync(new URL('../../.github/workflows/crawl-market.yml',import.meta.url),'utf8')
  assert.ok(workflow.includes("cron: '0 1 * * *'"))
  assert.ok(workflow.includes('python -m app.market_sync'))
  assert.ok(workflow.includes('uses: ./.github/workflows/deploy-preview.yml'))
})
