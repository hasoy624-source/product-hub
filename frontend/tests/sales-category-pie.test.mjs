import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {salesModelCategory,salesCategories} from '../src/sales-categories.ts'
import {generateSalesConclusion,defaultConclusionFilters} from '../src/sales-conclusions-model.ts'
import {buildSalesHistory} from '../src/sales-maintenance-model.ts'
import {donutPath} from '../src/sales-pie-model.ts'
import {categoryTone} from '../src/semantics.ts'
const data=JSON.parse(readFileSync(new URL('../public/sales/lifecycle.json',import.meta.url),'utf8'))
test('user model rules preserve full names while classifying whitespace/case and quote variants',()=>{
  for(const model of ['Mini 2','mini2','O2 Mini','Ｏ２ Ｍｉｎｉ'])assert.equal(salesModelCategory(model),'电池类')
  for(const model of ['单发Tip头','双发TIP 头'])assert.equal(salesModelCategory(model),'配件类')
  for(const model of ['y-039','Y-055'])assert.equal(salesModelCategory(model),'一次性')
  for(const model of ["'026",'‘027','’025','0074雾化器'])assert.equal(salesModelCategory(model),'雾化器')
  for(const model of ['122N','H2O MINI','mini','0074 atomizer','__proto__'])assert.equal(salesModelCategory(model),'待分类')
  assert.deepEqual(salesCategories,['电池类','配件类','干烧类','雾化器','一次性','待分类'])
  assert.equal(new Set(salesCategories.map(categoryTone)).size,6)
})
test('released quantities reconcile to category pie shares without changing total or missing values',()=>{
  const report=generateSalesConclusion(data,defaultConclusionFilters(data),[]),sums=Object.fromEntries(report.shares.map(row=>[row.category,row.units]))
  assert.deepEqual(sums,{'电池类':1436649,'配件类':75940,'干烧类':303301,'雾化器':390005,'一次性':60240,'待分类':14008})
  assert.equal(report.shares.reduce((sum,row)=>sum+row.units,0),2280143)
  assert.ok(Math.abs(report.shares.reduce((sum,row)=>sum+row.share,0)-1)<1e-12)
  assert.equal(data.products.flatMap(row=>row.monthly_units).filter(value=>value===null).length,872)
  assert.equal(report.products.find(row=>row.model==="'026").category,'雾化器')
})
test('pie follows time product type and reference price filters and keeps empty/zero states truthful',()=>{
  const f=defaultConclusionFilters(data)
  const atom=generateSalesConclusion(data,{...f,category:'雾化器'},[])
  assert.equal(atom.total,390005);assert.equal(atom.shares.length,1);assert.equal(atom.shares[0].share,1)
  const sept=generateSalesConclusion(data,{...f,from:'2026-09',to:'2026-09',category:'一次性'},[])
  assert.equal(sept.shares.reduce((sum,row)=>sum+row.units,0),sept.total)
  const empty=generateSalesConclusion(data,{...f,price_mode:'range',min:'5',max:'10'},[])
  assert.equal(empty.empty,true);assert.deepEqual(empty.shares,[])
  const row={...data.products[0],monthly_units:[0],recorded_rows:[1],source_rows:1}
  const zeroData={...data,through_month:1,months:['2026-01'],products:[row]},zero=generateSalesConclusion(zeroData,defaultConclusionFilters(zeroData),[])
  assert.equal(zero.empty,false);assert.equal(zero.shares[0].share,0)
})
test('manual new models share the same category rules and pie paths handle whole-circle and small slices',async()=>{
  const result=await buildSalesHistory(data?[data]:[],[{year:2027,month:1,model:'Y-NEW',units:5},{year:2027,month:1,model:"'NEW",units:2},{year:2027,month:1,model:'Mini 2',units:3}])
  assert.deepEqual(result[0].products.map(row=>row.category),['一次性','雾化器','电池类'])
  assert.equal((donutPath(-Math.PI/2,Math.PI*1.5).match(/A/g)||[]).length,4)
  assert.ok(!donutPath(0,.001).includes('NaN'))
  const ui=readFileSync(new URL('../src/SalesConclusions.tsx',import.meta.url),'utf8')
  assert.ok(ui.includes('<SalesConclusionPie'));assert.ok(ui.includes('conclusion-text-details'))
})
