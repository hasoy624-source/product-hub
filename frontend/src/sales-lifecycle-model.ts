import type { Project } from './types'

export type SalesModel={id:string;model:string;category:string;monthly_units:(number|null)[];recorded_rows:number[];source_rows:number;missing_model:boolean}
export type SalesDataset={schema_version:number;year:number;through_month:number;blank_policy:'missing';months:string[];products:SalesModel[];source_rows:number;missing_model_records:number;monthly_totals:number[];summary_difference:(number|null)[];revision:string}
export const salesCategories=['电池类','配件类','干烧类','待分类']
export function modelKey(value:string){return value.normalize('NFKC').replace(/\s+/g,'').toUpperCase()}
export function salesRows(data:SalesDataset,category='all',query=''){
  return data.products.filter(row=>(category==='all'||row.category===category)&&row.model.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>salesTotal(b)-salesTotal(a)||a.model.localeCompare(b.model,'zh-CN'))
}
export function salesTotal(row:SalesModel){return row.monthly_units.reduce<number>((sum,value)=>sum+(value??0),0)}
export function salesSeries(rows:SalesModel[],length:number){return Array.from({length},(_,index)=>{const known=rows.map(row=>row.monthly_units[index]).filter((value):value is number=>value!==null);return known.length?known.reduce((sum,value)=>sum+value,0):null})}
export function recordedLife(row:SalesModel,months:string[]){
  const positive=row.monthly_units.map((qty,index)=>qty!==null&&qty>0?index:-1).filter(index=>index>=0)
  const first=positive[0],last=positive.at(-1)
  return {first:first===undefined?null:months[first],last:last===undefined?null:months[last],recordedMonths:row.monthly_units.filter(qty=>qty!==null).length,peak:Math.max(...row.monthly_units.map(qty=>qty??0)),total:salesTotal(row)}
}
export function matchedSalesProject(row:SalesModel,projects:Project[]){return projects.find(project=>modelKey(project.name)===modelKey(row.model))}
export function validateSalesDataset(data:SalesDataset):SalesDataset{
  if(data.schema_version!==1||!Array.isArray(data.products)||data.blank_policy!=='missing'||!Array.isArray(data.months)||data.months.length!==data.through_month||!Number.isInteger(data.year)||data.year<1900||data.year>9998||data.through_month<1||data.through_month>12)throw new Error('销售数据格式不匹配')
  if(data.months.some((month,index)=>month!==`${data.year}-${String(index+1).padStart(2,'0')}`)||new Set(data.products.map(row=>row.id)).size!==data.products.length)throw new Error('销售月份或型号重复')
  if(data.products.some(row=>typeof row.id!=='string'||typeof row.model!=='string'||!salesCategories.includes(row.category)||!Array.isArray(row.monthly_units)||row.monthly_units.length!==data.through_month||row.monthly_units.some(value=>value!==null&&(!Number.isSafeInteger(value)||value<0))||!Array.isArray(row.recorded_rows)||row.recorded_rows.length!==data.through_month||!Number.isInteger(row.source_rows)||row.source_rows<1||row.recorded_rows.some(value=>!Number.isInteger(value)||value<0||value>row.source_rows)))throw new Error('销售数量格式不匹配')
  return data
}
export async function fetchSalesDataset(base:string):Promise<SalesDataset|null>{
  const response=await fetch(`${base}sales/lifecycle.json`,{cache:'no-store'})
  if(response.status===404)return null
  if(!response.ok)throw new Error('销售数据读取失败')
  const data=await response.json() as SalesDataset
  return validateSalesDataset(data)
}
