import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {generateSalesConclusion,defaultConclusionFilters,priceCents,previewSalesPrices,salesPriceStorageKey} from '../src/sales-conclusions-model.ts'
const a={id:'a',model:'D-1',category:'电池类',monthly_units:[10,null,30],recorded_rows:[1,0,1],source_rows:1,missing_model:false}
const b={...a,id:'b',model:'P-1',category:'配件类',monthly_units:[2,3,4],recorded_rows:[1,1,1]}
const c={...a,id:'c',model:'G-1',category:'干烧类',monthly_units:[0,0,0],recorded_rows:[1,1,1]}
const data={months:['2026-01','2026-02','2026-03'],products:[a,b,c]}
const filters=()=>defaultConclusionFilters(data)
test('conclusions use exact selected months and categories without treating missing values as zero or decline',()=>{
  const report=generateSalesConclusion(data,filters(),[])
  assert.equal(report.total,49);assert.equal(report.models,3)
  assert.equal(report.points.find(p=>p.title==='首末月比较'),undefined)
  assert.ok(report.notes.some(n=>n.includes('1 个空缺')))
  assert.ok(report.notes.some(n=>n.includes('3 个型号汇总未录入售价')))
  assert.equal(generateSalesConclusion(data,{...filters(),from:'2026-02',category:'配件类'},[]).total,7)
  assert.equal(generateSalesConclusion(data,{...filters(),from:'2026-02',to:'2026-02'},[]).models,2)
  assert.throws(()=>generateSalesConclusion(data,{...filters(),from:'2026-03',to:'2026-01'},[]))
  assert.throws(()=>generateSalesConclusion(data,{...filters(),from:'2025-01'},[]))
})
test('reference price range is inclusive, excludes missing prices, and never mixes currencies',()=>{
  const prices=[{product_id:'a',currency:'USD',amount_cents:500},{product_id:'b',currency:'CNY',amount_cents:500},{product_id:'c',currency:'USD',amount_cents:1000}]
  const range={...filters(),price_mode:'range',min:'5',max:'10'}
  assert.equal(generateSalesConclusion(data,range,prices).total,40)
  assert.deepEqual(generateSalesConclusion(data,range,prices).rows.map(r=>r.id),['a','c'])
  assert.equal(generateSalesConclusion(data,{...range,currency:'CNY'},prices).total,9)
  assert.equal(generateSalesConclusion(data,range,[]).empty,true)
  assert.equal(generateSalesConclusion(data,{...filters(),price_mode:'missing'},prices).rows.length,0)
  assert.throws(()=>generateSalesConclusion(data,{...range,min:'11'},prices))
  assert.throws(()=>generateSalesConclusion(data,{...range,min:'',max:''},prices))
})
test('zero and unrecorded periods produce distinct factual conclusions and complete periods support comparisons',()=>{
  const zero=generateSalesConclusion(data,{...filters(),category:'干烧类'},[])
  assert.equal(zero.empty,false);assert.ok(zero.points.some(p=>p.text.includes('0 件')))
  assert.equal(generateSalesConclusion(data,{...filters(),category:'电池类',from:'2026-02',to:'2026-02'},[]).empty,true)
  const complete=generateSalesConclusion(data,{...filters(),category:'配件类'},[])
  assert.ok(complete.points.some(p=>p.title==='首末月比较'&&p.text.includes('100.0%')))
})
test('price cents validation and preview management preserve snapshot and persist exact manual inputs',()=>{
  assert.equal(priceCents('5.25'),525);assert.equal(priceCents('0'),0);assert.equal(priceCents(''),null)
  for(const input of ['-1','NaN','Infinity','1.123','1e3','10000001'])assert.throws(()=>priceCents(input))
  const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},original=JSON.stringify(data)
  previewSalesPrices('/sales-prices/a','PUT',{currency:'USD',amount_cents:525},data,storage)
  assert.deepEqual(previewSalesPrices('/sales-prices','GET',null,data,storage),[{product_id:'a',currency:'USD',amount_cents:525}])
  assert.equal(JSON.stringify(data),original);assert.ok(values.has(salesPriceStorageKey))
  assert.throws(()=>previewSalesPrices('/sales-prices/unknown','PUT',{currency:'USD',amount_cents:525},data,storage))
  assert.throws(()=>previewSalesPrices('/sales-prices/a','PUT',{currency:'XXX',amount_cents:525},data,storage))
  assert.throws(()=>previewSalesPrices('/sales-prices/a','PUT',{currency:'USD',amount_cents:-1},data,storage))
  previewSalesPrices('/sales-prices/a','PUT',{currency:'USD',amount_cents:null},data,storage)
  assert.deepEqual(previewSalesPrices('/sales-prices','GET',null,data,storage),[])
})
test('published dataset produces reconciled conclusions without prices or guessed financial and lifecycle claims',()=>{
  const snapshot=JSON.parse(readFileSync(new URL('../public/sales/lifecycle.json',import.meta.url),'utf8'))
  const report=generateSalesConclusion(snapshot,defaultConclusionFilters(snapshot),[])
  assert.equal(report.total,2280143);assert.equal(report.models,125)
  assert.ok(report.points.some(p=>p.title==='产品结构'&&p.text.includes('1,430,541')&&p.text.includes('62.7%')))
  assert.ok(report.points.some(p=>p.title==='时间分布'&&p.text.includes('2026-03')&&p.text.includes('563,400')))
  assert.equal(report.points.some(p=>p.title==='首末月比较'),false)
  assert.ok(report.notes.some(n=>n.includes('126 个型号汇总未录入售价')))
  for(const guess of ['销售额为','成熟期','衰退期','市场需求增长'])assert.equal(JSON.stringify(report.points).includes(guess),false)
})
