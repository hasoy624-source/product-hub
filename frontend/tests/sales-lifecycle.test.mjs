import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {salesRows,salesSeries,recordedLife,matchedSalesProject,fetchSalesDataset} from '../src/sales-lifecycle-model.ts'
const a={id:'a',model:'D-100',category:'电池类',monthly_units:[10,null,0,20],recorded_rows:[1,0,1,1],source_rows:1,missing_model:false}
const b={...a,id:'b',model:'P-1',category:'配件类',monthly_units:[null,5,null,null]}
const data={months:['2026-01','2026-02','2026-03','2026-04'],products:[a,b],through_month:4}
test('sales filters and observed totals distinguish blank cells from explicit zero',()=>{
  assert.deepEqual(salesSeries([a],4),[10,null,0,20])
  assert.deepEqual(salesSeries([a,b],4),[10,5,0,20])
  assert.equal(salesRows(data,'配件类')[0].id,'b')
  assert.equal(salesRows(data,'all','d-100').length,1)
})
test('lifecycle observation uses recorded sales, not assumed launch or decline dates',()=>{
  assert.deepEqual(recordedLife(a,data.months),{first:'2026-01',last:'2026-04',recordedMonths:3,peak:20,total:30})
  assert.equal(matchedSalesProject(a,[{id:'p',name:'D-100'}]).id,'p')
  assert.equal(matchedSalesProject({...a,model:'D-100吸嘴'},[{id:'p',name:'D-100'}]),undefined)
  assert.equal(recordedLife({...a,monthly_units:[null,null]},data.months).first,null)
})
test('snapshot fetch resolves the Pages subpath and preserves real retrieval errors',async()=>{
  const original=globalThis.fetch
  globalThis.fetch=async url=>{assert.equal(url,'/product-hub/sales/lifecycle.json');return {status:404,ok:false}}
  assert.equal(await fetchSalesDataset('/product-hub/'),null)
  globalThis.fetch=async()=>({status:500,ok:false});await assert.rejects(()=>fetchSalesDataset('/product-hub/'))
  globalThis.fetch=original
})
test('released sales data reconciles complete detail totals without private workbook fields',()=>{
  const text=readFileSync(new URL('../public/sales/lifecycle.json',import.meta.url),'utf8'),snapshot=JSON.parse(text)
  assert.equal(snapshot.year,2026);assert.equal(snapshot.through_month,9);assert.equal(snapshot.blank_policy,'missing')
  assert.equal(snapshot.products.length,126);assert.equal(snapshot.source_rows,165)
  assert.equal(snapshot.monthly_totals.reduce((sum,value)=>sum+value,0),2280143)
  assert.equal(snapshot.summary_difference.reduce((sum,value)=>sum+(value??0),0),20000)
  assert.equal(snapshot.missing_model_records,1)
  for(const label of ['Client','Meeting Agenda','Notes','Trade Show Schedule','报价'])assert.equal(text.includes(label),false)
  assert.ok(snapshot.products.some(row=>row.monthly_units.some(value=>value===null)))
})
