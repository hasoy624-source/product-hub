import {modelKey} from './sales-lifecycle-model.ts'
import type {SalesDataset,SalesModel} from './sales-lifecycle-model'
import {salesModelCategory} from './sales-categories.ts'
export type SalesCell={year:number;model:string;month:number;units:number|null}
export type SalesBatch={revision:string;mode:'fill'|'replace';source:'manual'|'excel'|'backup';rows:SalesCell[]}
export type SalesPlan={changes:(SalesCell&{before:number|null})[];changed:number;skipped:number;identical:number}
export type SalesChange={id:string;label:string;created_at:string;count:number;undone:boolean;before_patches?:SalesCell[]}
export type SalesStore={version:string;patches:SalesCell[];changes:SalesChange[]}
export type SalesDataView={history:SalesDataset[];revision:string;changes:SalesChange[];latest_undoable:Omit<SalesChange,'before_patches'>|null;storage:'browser'|'server';result?:SalesPlan}
export const emptySalesStore=():SalesStore=>({version:'empty',patches:[],changes:[]})
export const salesDataRevision=(base:SalesDataset[],version:string)=>base.slice().sort((a,b)=>b.year-a.year).map(data=>`${data.year}:${data.revision}`).join('|')+'#'+version
export const salesCellKey=(cell:SalesCell)=>JSON.stringify([cell.year,modelKey(cell.model),cell.month])
export function validateSalesCells(rows:SalesCell[]):SalesCell[]{
  if(!Array.isArray(rows)||!rows.length||rows.length>5000)throw new Error('每次请提交 1–5000 条型号月份合计')
  const seen=new Set<string>()
  return rows.map(row=>{
    if(!row||!Number.isInteger(row.year)||row.year<1900||row.year>9998||!Number.isInteger(row.month)||row.month<1||row.month>12||typeof row.model!=='string'||!row.model.trim()||row.model.length>200||/[\x00-\x1f\x7f]/.test(row.model)||row.units!==null&&(!Number.isSafeInteger(row.units)||row.units<0||row.units>1000000000))throw new Error('请检查年份、月份、型号及非负整数销量')
    const cell={year:row.year,model:row.model.trim().replace(/\s+/g,' '),month:row.month,units:row.units},key=salesCellKey(cell)
    if(seen.has(key))throw new Error('同一型号年月重复，请保留一条月合计');seen.add(key);return cell
  })
}
async function digest(value:string){const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(raw),byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,20)}
export async function buildSalesHistory(base:SalesDataset[],patches:SalesCell[]):Promise<SalesDataset[]>{
  const result=structuredClone(base),affected=new Set<number>()
  for(const patch of patches){
    let data=result.find(data=>data.year===patch.year);const key=modelKey(patch.model)
    if(!data){if(patch.units===null)continue;data={schema_version:1,year:patch.year,through_month:patch.month,blank_policy:'missing',months:[],products:[],source_rows:0,missing_model_records:0,monthly_totals:[],summary_difference:[],revision:''};result.push(data)}
    const length=Math.max(data.through_month,patch.month);data.through_month=length;data.months=Array.from({length},(_,i)=>`${patch.year}-${String(i+1).padStart(2,'0')}`)
    for(const row of data.products){while(row.monthly_units.length<length)row.monthly_units.push(null);while(row.recorded_rows.length<length)row.recorded_rows.push(0)}
    let product=data.products.find(row=>modelKey(row.model)===key)
    if(!product){if(patch.units===null)continue;product={id:'sales-'+await digest(key),model:patch.model,category:salesModelCategory(key),monthly_units:Array(length).fill(null),recorded_rows:Array(length).fill(0),source_rows:1,missing_model:key==='未标注型号'};data.products.push(product)}
    product.monthly_units[patch.month-1]=patch.units;product.recorded_rows[patch.month-1]=Number(patch.units!==null);product.aggregate_months=[...new Set([...(product.aggregate_months||[]),patch.month])].sort((a,b)=>a-b);affected.add(data.year)
  }
  for(const data of result){if(!affected.has(data.year))continue;data.aggregation=data.products.every(row=>row.source_rows===1)?'model-month':'mixed';data.source_rows=data.products.reduce((sum,row)=>sum+row.source_rows,0);data.missing_model_records=data.products.filter(row=>row.missing_model&&row.monthly_units.some(value=>value!==null)).length;data.monthly_totals=data.months.map((_,i)=>data.products.reduce((sum,row)=>sum+(row.monthly_units[i]??0),0));data.summary_difference=Array(data.through_month).fill(null);data.revision=await digest(JSON.stringify(data))}
  for(const data of result)for(const product of data.products)product.category=salesModelCategory(product.model)
  return result.sort((a,b)=>b.year-a.year)
}
export function planSalesCells(history:SalesDataset[],rows:SalesCell[],mode:SalesBatch['mode']):SalesPlan{
  if(!['fill','replace'].includes(mode))throw new Error('请选择更新方式')
  const changes:SalesPlan['changes']=[];let skipped=0,identical=0
  for(const cell of validateSalesCells(rows)){
    const data=history.find(data=>data.year===cell.year),row=data?.products.find(row=>modelKey(row.model)===modelKey(cell.model))
    if(modelKey(cell.model)==='未标注型号'&&!row)throw new Error('请填写真实产品型号')
    const before=row?.monthly_units[cell.month-1]??null
    if(before===cell.units){identical++;continue}
    if(mode==='fill'&&before!==null){skipped++;continue}
    changes.push({...cell,before})
  }
  return {changes,changed:changes.length,skipped,identical}
}
export async function salesDataView(base:SalesDataset[],store:SalesStore):Promise<SalesDataView>{const last=store.changes.find(row=>!row.undone),publicRow=({before_patches:_,...row}:SalesChange)=>row;return {history:await buildSalesHistory(base,store.patches),revision:salesDataRevision(base,store.version),changes:store.changes.slice(0,20).map(publicRow),latest_undoable:last?publicRow(last):null,storage:'browser'}}
export async function applySalesBatch(base:SalesDataset[],store:SalesStore,batch:SalesBatch){
  if(batch.revision!==salesDataRevision(base,store.version))throw new Error('数据已更新，请刷新后重新预览')
  if(!['manual','excel','backup'].includes(batch.source))throw new Error('维护来源无效')
  const result=planSalesCells(await buildSalesHistory(base,store.patches),batch.rows,batch.mode)
  if(!result.changed)return {store,result}
  const patches=new Map(store.patches.map(row=>[salesCellKey(row),row]))
  for(const {before:_,...row} of result.changes)patches.set(salesCellKey(row),row)
  const change:SalesChange={id:crypto.randomUUID(),label:{manual:'手动维护',excel:'Excel 导入',backup:'备份导入'}[batch.source],created_at:new Date().toISOString(),count:result.changed,undone:false,before_patches:structuredClone(store.patches)}
  return {store:{version:crypto.randomUUID(),patches:[...patches.values()],changes:[change,...structuredClone(store.changes)]},result}
}
export function undoSalesBatch(base:SalesDataset[],store:SalesStore,id:string,revision:string):SalesStore{
  if(revision!==salesDataRevision(base,store.version))throw new Error('数据已更新，请刷新后重试')
  const last=store.changes.find(row=>!row.undone)
  if(!last||last.id!==id)throw new Error('只能撤销最近一次未撤销的维护')
  return {version:crypto.randomUUID(),patches:structuredClone(last.before_patches||[]),changes:store.changes.map(row=>row.id===id?{...row,undone:true}:structuredClone(row))}
}
export function salesBackupRows(history:SalesDataset[]):SalesCell[]{return history.flatMap(data=>data.products.flatMap(row=>row.monthly_units.map((units,i)=>({year:data.year,model:row.model,month:i+1,units}))))}
export function parseSalesBackup(text:string):SalesCell[]{const data=JSON.parse(text);if(data.schema_version!==1||data.kind!=='impetus-sales-backup')throw new Error('请选择本系统销售备份 JSON');return validateSalesCells(data.rows)}
export function priceCatalog(history:SalesDataset[]):SalesModel[]{return [...new Map(history.flatMap(data=>data.products).map(row=>[row.id,row])).values()]}
