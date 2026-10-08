import {fetchSalesDataset,validateSalesDataset,salesRows,salesSeries,classifiedSalesDataset} from './sales-lifecycle-model.ts'
import type {SalesDataset,SalesModel} from './sales-lifecycle-model'
export type ComparisonRow={id:string;model:string;category:string;current:number|null;previous:number|null;delta:number|null}
export function recordedPeriod(row:SalesModel|undefined,length:number):number|null{
  if(!row)return null
  const known=row.monthly_units.slice(0,length).filter((value):value is number=>value!==null)
  return known.length?known.reduce((sum,value)=>sum+value,0):null
}
export function compareSales(current:SalesDataset,previous:SalesDataset,category='all',query='',productId=''){
  if(previous.year!==current.year-1)throw new Error('同期对比须使用相邻年度')
  const length=Math.min(current.through_month,previous.through_month),a=salesRows(current,category,query).filter(row=>!productId||row.id===productId),b=salesRows(previous,category,query).filter(row=>!productId||row.id===productId)
  const currentSeries=salesSeries(a,length),previousSeries=salesSeries(b,length)
  const sum=(values:(number|null)[])=>values.some(value=>value!==null)?values.reduce<number>((total,value)=>total+(value??0),0):null
  const currentTotal=sum(currentSeries),previousTotal=sum(previousSeries),delta=currentTotal!==null&&previousTotal!==null?currentTotal-previousTotal:null
  const ids=[...new Set([...a,...b].filter(row=>!row.missing_model).map(row=>row.id))]
  const rows:ComparisonRow[]=ids.map(id=>{const now=a.find(row=>row.id===id),before=b.find(row=>row.id===id),row=now||before!,cur=recordedPeriod(now,length),prev=recordedPeriod(before,length);return {id,model:row.model,category:row.category,current:cur,previous:prev,delta:cur!==null&&prev!==null?cur-prev:null}}).sort((x,y)=>(y.current??-1)-(x.current??-1)||(y.previous??-1)-(x.previous??-1)||x.model.localeCompare(y.model))
  return {length,currentSeries,previousSeries,currentTotal,previousTotal,delta,percent:previousTotal!==null&&previousTotal>0&&delta!==null?delta/previousTotal:null,rows}
}
export async function fetchSalesHistory(base:string):Promise<SalesDataset[]>{
  const response=await fetch(`${base}sales/history.json`,{cache:'no-store'})
  if(response.status===404){const data=await fetchSalesDataset(base);return data?[data]:[]}
  if(!response.ok)throw new Error('销售年度目录读取失败')
  const index=await response.json() as {schema_version:number;years:{year:number;file:string}[]}
  if(index.schema_version!==1||!Array.isArray(index.years)||!index.years.length||index.years.some(row=>!Number.isInteger(row.year)||row.year<1900||row.year>9998||!/^lifecycle(?:-\d{4})?\.json$/.test(row.file))||new Set(index.years.map(row=>row.year)).size!==index.years.length)throw new Error('销售年度目录格式不匹配')
  const result=await Promise.all(index.years.map(async row=>{const source=await fetch(`${base}sales/${row.file}`,{cache:'no-store'});if(!source.ok)throw new Error(`${row.year} 年销量读取失败`);const data=validateSalesDataset(await source.json());if(data.year!==row.year)throw new Error('销量年份与年度目录不一致');return data}))
  return result.map(classifiedSalesDataset).sort((a,b)=>b.year-a.year)
}
