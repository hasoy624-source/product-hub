import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {compareSales,fetchSalesHistory,recordedPeriod} from '../src/sales-history-model.ts'
import {generateSalesConclusion,defaultConclusionFilters,previewSalesPrices} from '../src/sales-conclusions-model.ts'
const file=name=>JSON.parse(readFileSync(new URL('../public/sales/'+name,import.meta.url),'utf8'))
const current=file('lifecycle.json'),previous=file('lifecycle-2025.json')
test('history preserves 2026 and imports only 2025 primary details, reconciling the omitted September row',()=>{
  assert.equal(current.monthly_totals.reduce((a,b)=>a+b,0),2280143)
  assert.equal(previous.products.length,127);assert.equal(previous.source_rows,199)
  assert.equal(previous.monthly_totals.reduce((a,b)=>a+b,0),3039874)
  assert.equal(previous.monthly_totals.slice(0,9).reduce((a,b)=>a+b,0),2124328)
  assert.deepEqual(previous.summary_difference,[0,0,0,0,0,0,0,0,8508,0,0,0])
  assert.ok(previous.products.some(row=>row.model==='IMH'&&row.monthly_units[8]===8508))
  assert.ok(previous.products.some(row=>row.model==='D-071 mouthpiece'))
  const text=JSON.stringify(previous)
  for(const field of ['CC0002','Client','Meeting Agenda','Notes','Summer Champs','报价'])assert.equal(text.includes(field),false)
})
test('same-period comparisons align Jan-Sep rather than comparing a partial year with the full previous year',()=>{
  const result=compareSales(current,previous)
  assert.equal(result.length,9);assert.equal(result.currentTotal,2280143);assert.equal(result.previousTotal,2124328)
  assert.equal(result.delta,155815);assert.ok(Math.abs(result.percent-155815/2124328)<1e-12)
  assert.equal(compareSales(current,previous,'配件类').rows.some(row=>row.category!=='配件类'),false)
  assert.throws(()=>compareSales(current,{...previous,year:2024}))
  assert.equal(compareSales(current,previous,'all','D-071 mouthpiece').rows.some(row=>row.model==='D-071吸嘴'),false)
})
test('missing years and blank quantities do not become zero; explicit zero is preserved',()=>{
  assert.equal(recordedPeriod(undefined,9),null)
  assert.equal(recordedPeriod({...current.products[0],monthly_units:[null,null]},2),null)
  assert.equal(recordedPeriod({...current.products[0],monthly_units:[0,null]},2),0)
  const result=compareSales(current,previous,'all','P-146')
  assert.equal(result.rows[0].current,2000);assert.equal(result.rows[0].previous,null);assert.equal(result.rows[0].delta,null)
})
test('sales conclusions compare the selected same-month range and do not invent year-over-year business growth',()=>{
  const report=generateSalesConclusion(current,defaultConclusionFilters(current),[],previous)
  assert.ok(report.points.some(point=>point.title==='同期记录对比'&&point.text.includes('2,124,328')&&point.text.includes('155,815')&&point.text.includes('+7.3%')))
  assert.ok(report.notes.some(note=>note.includes('不等同真实经营增长')))
  const single=generateSalesConclusion(current,{...defaultConclusionFilters(current),from:'2026-06',to:'2026-06',category:'配件类'},[],previous)
  assert.ok(single.points.some(point=>point.title==='同期记录对比'))
})
test('Pages history loader validates years, preserves base paths, and reports a missing history file instead of silently dropping it',async()=>{
  const original=globalThis.fetch
  try{
    globalThis.fetch=async url=>({status:200,ok:true,json:async()=>url.endsWith('history.json')?file('history.json'):url.endsWith('lifecycle-2025.json')?previous:current})
    assert.deepEqual((await fetchSalesHistory('/product-hub/')).map(data=>data.year),[2026,2025])
    globalThis.fetch=async url=>url.endsWith('history.json')?{status:404,ok:false}:{status:200,ok:true,json:async()=>current}
    assert.equal((await fetchSalesHistory('/product-hub/')).length,1)
    globalThis.fetch=async url=>url.endsWith('history.json')?{status:200,ok:true,json:async()=>file('history.json')}:{status:404,ok:false}
    await assert.rejects(()=>fetchSalesHistory('/product-hub/'),/销量读取失败/)
    globalThis.fetch=async()=>({status:200,ok:true,json:async()=>({schema_version:1,years:[{year:2025,file:'../private.json'}]})})
    await assert.rejects(()=>fetchSalesHistory('/product-hub/'),/目录格式/)
  }finally{globalThis.fetch=original}
})
test('historic-only models can keep reference prices without changing import data or existing storage keys',()=>{
  const products=[...new Map([...current.products,...previous.products].map(row=>[row.id,row])).values()],data={...current,products}
  const model=previous.products.find(row=>!current.products.some(now=>now.id===row.id)),store=new Map(),storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}
  const source=JSON.stringify(previous)
  previewSalesPrices('/sales-prices/'+model.id,'PUT',{currency:'USD',amount_cents:700},data,storage)
  assert.equal(previewSalesPrices('/sales-prices','GET',null,data,storage)[0].amount_cents,700)
  assert.equal(JSON.stringify(previous),source)
  const ui=readFileSync(new URL('../src/SalesLifecycle.tsx',import.meta.url),'utf8')
  assert.ok(ui.includes('[details,setDetails]=useState(false)'));assert.ok(ui.includes('slice(0,10)'));assert.ok(ui.includes('销量年度'))
})
