import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {emptySalesStore,salesDataRevision,buildSalesHistory,planSalesCells,applySalesBatch,undoSalesBatch,salesBackupRows,parseSalesBackup,validateSalesCells,salesDataView} from '../src/sales-maintenance-model.ts'
import {parseSalesSheet,parseCSV,readSalesFile} from '../src/sales-excel.ts'
import {generateSalesConclusion,defaultConclusionFilters} from '../src/sales-conclusions-model.ts'
const row={id:'sales-a',model:'D-1',category:'电池类',monthly_units:[10,null],recorded_rows:[1,0],source_rows:1,missing_model:false}
const base=[{schema_version:1,year:2026,through_month:2,blank_policy:'missing',months:['2026-01','2026-02'],products:[row],source_rows:1,missing_model_records:0,monthly_totals:[10,0],summary_difference:[null,null],revision:'original'}]
const cell=(units,month=1,model='D-1',year=2026)=>({year,model,month,units})
test('manual maintenance replaces totals, persists explicit zero/missing and leaves base data immutable',async()=>{
  const original=JSON.stringify(base),store=emptySalesStore(),batch={revision:salesDataRevision(base,store.version),source:'manual',mode:'replace',rows:[cell(20)]}
  const next=await applySalesBatch(base,store,batch),history=await buildSalesHistory(base,next.store.patches)
  assert.equal(history[0].products[0].monthly_units[0],20);assert.equal(history[0].monthly_totals[0],20)
  assert.equal(history[0].aggregation,'model-month');assert.equal(JSON.stringify(base),original)
  const zero=await buildSalesHistory(base,[cell(0,2)]);assert.deepEqual(zero[0].products[0].monthly_units,[10,0])
  const missing=await buildSalesHistory(base,[cell(null)]);assert.deepEqual(missing[0].products[0].monthly_units,[null,null])
  assert.notEqual(history[0].revision,base[0].revision)
})
test('imports fill only empty cells by default, do not add repeated data and reject stale revisions',async()=>{
  assert.deepEqual(planSalesCells(base,[cell(20),cell(3,2)],'fill'),{changes:[{...cell(3,2),before:null}],changed:1,skipped:1,identical:0})
  const store=emptySalesStore(),batch={revision:salesDataRevision(base,store.version),source:'excel',mode:'replace',rows:[cell(20)]}
  const first=await applySalesBatch(base,store,batch),repeat=await applySalesBatch(base,first.store,{...batch,revision:salesDataRevision(base,first.store.version)})
  assert.equal(repeat.result.changed,0);assert.equal(repeat.result.identical,1);assert.equal(repeat.store.version,first.store.version)
  await assert.rejects(()=>applySalesBatch(base,first.store,batch),/数据已更新/)
})
test('new years and models preserve stable full-model IDs and missing prior months',async()=>{
  const a=await buildSalesHistory(base,[cell(7,10,'ｄ－２００',2027)]),b=await buildSalesHistory(base,[cell(7,10,'D-200',2027)])
  assert.equal(a[0].products[0].id,b[0].products[0].id);assert.equal(a[0].products[0].category,'电池类')
  assert.equal(a[0].through_month,10);assert.equal(a[0].products[0].monthly_units.filter(v=>v===null).length,9)
  assert.deepEqual(a[1],base[0])
})
test('undo restores only the latest change and annual backup preserves explicit missing cells',async()=>{
  let store=emptySalesStore();const original=store
  store=(await applySalesBatch(base,store,{revision:salesDataRevision(base,store.version),mode:'replace',source:'manual',rows:[cell(null)]})).store
  const restored=undoSalesBatch(base,store,store.changes[0].id,salesDataRevision(base,store.version))
  assert.deepEqual(restored.patches,original.patches);assert.equal(restored.changes[0].undone,true)
  const history=await buildSalesHistory(base,store.patches),rows=salesBackupRows(history)
  assert.equal(rows[0].units,null)
  assert.deepEqual(parseSalesBackup(JSON.stringify({schema_version:1,kind:'impetus-sales-backup',rows})),rows)
  assert.throws(()=>validateSalesCells([cell(1),cell(2)]),/重复/)
  for(const value of [-1,1.5,NaN,Infinity,1000000001])assert.throws(()=>validateSalesCells([cell(value)]))
})
test('wide Excel aggregation stops before duplicate analysis and blanks are never imported as zero',()=>{
  const rows=[{row:2,cells:{1:{value:'Monthly Product Sales by Customer - 2025'}}},{row:3,cells:{3:{value:' '},4:{value:'Jan'},5:{value:'Feb'}}},{row:4,cells:{3:{value:'D-1'},4:{value:'10'}}},{row:5,cells:{3:{value:'D-1'},4:{value:'20'},5:{value:'0'}}},{row:6,cells:{4:{value:'30',formula:'SUM(D4:D5)'}}},{row:7,cells:{3:{value:'D-1'},4:{value:'99999'}}}]
  const result=parseSalesSheet(rows,2026,2)
  assert.equal(result.year,2025);assert.deepEqual(result.rows,[cell(30,1,'D-1',2025),cell(0,2,'D-1',2025)])
  rows[3].cells[3].value='D-\n1';assert.deepEqual(parseSalesSheet(rows,2026,2).rows,result.rows)
})
test('long table CSV validates complete keys and duplicate totals rather than silently adding them',()=>{
  const matrix=parseCSV('年份,月份,产品型号,销量\r\n2026,10,"D-1",2000\r\n2026,11,D-1,\r\n'),rows=matrix.map((row,i)=>({row:i+1,cells:Object.fromEntries(row.map((value,index)=>[index+1,{value}]))}))
  assert.deepEqual(parseSalesSheet(rows,2025,12).rows,[cell(2000,10)])
  assert.throws(()=>parseSalesSheet([...rows,{...rows[1],row:4}],2025,12),/重复/)
})
test('maintenance is linked into both overview and sales and preserves the published snapshots',()=>{
  const ui=readFileSync(new URL('../src/SalesLifecycle.tsx',import.meta.url),'utf8')
  assert.ok(ui.includes('数据维护'));assert.ok(ui.includes('<SalesDataManager'))
  const data=JSON.parse(readFileSync(new URL('../public/sales/lifecycle.json',import.meta.url),'utf8'))
  assert.equal(data.monthly_totals.reduce((a,b)=>a+b,0),2280143)
})
test('editing one model preserves other models partial coverage and cannot manufacture growth conclusions',async()=>{
  const source=structuredClone(base);source[0].products[0].source_rows=2;source[0].products[0].monthly_units=[10,20];source[0].products[0].recorded_rows=[1,1]
  const result=await buildSalesHistory(source,[cell(7,2,'P-NEW')]),unchanged=result[0].products.find(row=>row.model==='D-1')
  assert.equal(unchanged.source_rows,2);assert.deepEqual(unchanged.recorded_rows,[1,1]);assert.equal(unchanged.aggregate_months,undefined)
  const report=generateSalesConclusion(result[0],defaultConclusionFilters(result[0]),[])
  assert.equal(report.points.some(point=>point.title==='首末月比较'),false)
  const partial=await buildSalesHistory(source,[cell(15)])
  assert.deepEqual(partial[0].products[0].aggregate_months,[1]);assert.deepEqual(partial[0].products[0].recorded_rows,[1,1])
})
test('latest undoable remains available after more than twenty historical changes',async()=>{
  let store=emptySalesStore()
  for(let i=1;i<=21;i++)store=(await applySalesBatch(base,store,{revision:salesDataRevision(base,store.version),mode:'replace',source:'manual',rows:[cell(10+i)]})).store
  for(let i=0;i<21;i++){const view=await salesDataView(base,store);assert.ok(view.latest_undoable);store=undoSalesBatch(base,store,view.latest_undoable.id,view.revision)}
  assert.equal((await salesDataView(base,store)).latest_undoable,null);assert.deepEqual(store.patches,[])
})
test('formula cache absence and summary labels cannot silently drop or double-count sales',()=>{
  const long=[{row:1,cells:{1:{value:'年份'},2:{value:'月份'},3:{value:'型号'},4:{value:'销量'}}},{row:2,cells:{1:{value:'2026'},2:{value:'1'},3:{value:'D-1'},4:{value:null,formula:'SUM(A3:A4)'}}}]
  assert.throws(()=>parseSalesSheet(long,2026,12),/公式缺少结果/)
  const wide=[{row:1,cells:{1:{value:'型号'},2:{value:'Jan'},3:{value:'Feb'}}},{row:2,cells:{1:{value:'D-1'},2:{value:'10'}}},{row:3,cells:{1:{value:'Total (PCS)'},2:{value:'10'}}},{row:4,cells:{1:{value:'D-1'},2:{value:'999'}}}]
  assert.deepEqual(parseSalesSheet(wide,2026,2).rows,[cell(10)])
  assert.throws(()=>parseSalesSheet(wide,2026,2,true),/CSV 请使用/)
})
test('CSV must be strict UTF-8 and every input format has the same row cap',async()=>{
  const raw=new Uint8Array([0xb2,0xfa,0xc6,0xb7])
  await assert.rejects(()=>readSalesFile({name:'gbk.csv',size:raw.length,arrayBuffer:async()=>raw.buffer},2026,12),/UTF-8/)
  assert.throws(()=>parseSalesSheet(Array.from({length:20001},(_,i)=>({row:i+1,cells:{}})),2026,12),/20,000/)
})
