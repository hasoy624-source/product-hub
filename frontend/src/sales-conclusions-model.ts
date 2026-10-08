import type {SalesDataset,SalesModel} from './sales-lifecycle-model'

export type SalesPrice={product_id:string;currency:'USD'|'CNY';amount_cents:number}
export type ConclusionFilters={from:string;to:string;category:string;price_mode:'all'|'range'|'missing';currency:'USD'|'CNY';min:string;max:string}
export type SalesConclusion={scope:string;total:number;models:number;rows:SalesModel[];points:{title:string;text:string}[];notes:string[];empty:boolean}
const number=(value:number)=>new Intl.NumberFormat('zh-CN').format(value)
const percent=(value:number)=>`${(value*100).toFixed(1)}%`
export function priceCents(value:string):number|null{
  if(!value.trim())return null
  if(!/^\d+(\.\d{1,2})?$/.test(value.trim()))throw new Error('售价须为非负数，最多两位小数')
  const [whole,fraction='']=value.trim().split('.'),result=Number(whole)*100+Number(fraction.padEnd(2,'0'))
  if(!Number.isSafeInteger(result)||result>1000000000)throw new Error('售价超出有效范围')
  return result
}
export function defaultConclusionFilters(data:SalesDataset):ConclusionFilters{
  return {from:data.months[0],to:data.months.at(-1)!,category:'all',price_mode:'all',currency:'USD',min:'',max:''}
}
export function generateSalesConclusion(data:SalesDataset,filters:ConclusionFilters,prices:SalesPrice[]):SalesConclusion{
  const start=data.months.indexOf(filters.from),end=data.months.indexOf(filters.to)
  if(start<0||end<start)throw new Error('请选择有效时间范围，开始月份不晚于结束月份')
  if(!['all','电池类','配件类','干烧类','待分类'].includes(filters.category))throw new Error('产品类型无效')
  if(!['all','range','missing'].includes(filters.price_mode)||!['USD','CNY'].includes(filters.currency))throw new Error('售价筛选无效')
  const min=filters.price_mode==='range'?priceCents(filters.min):null,max=filters.price_mode==='range'?priceCents(filters.max):null
  if(filters.price_mode==='range'&&min===null&&max===null)throw new Error('请填写最低或最高售价')
  if(min!==null&&max!==null&&min>max)throw new Error('最低售价不应高于最高售价')
  const priceMap=new Map(prices.map(price=>[price.product_id,price])),base=data.products.filter(row=>filters.category==='all'||row.category===filters.category)
  const rows=base.filter(row=>{const price=priceMap.get(row.id);return filters.price_mode==='all'||filters.price_mode==='missing'&&!price||filters.price_mode==='range'&&Boolean(price&&price.currency===filters.currency&&(min===null||price.amount_cents>=min)&&(max===null||price.amount_cents<=max))})
  const monthCount=end-start+1,sum=(row:SalesModel)=>row.monthly_units.slice(start,end+1).reduce<number>((total,value)=>total+(value??0),0)
  const total=rows.reduce((value,row)=>value+sum(row),0),models=rows.filter(row=>!row.missing_model&&row.monthly_units.slice(start,end+1).some(value=>value!==null)).length
  const priceScope=filters.price_mode==='all'?'全部售价（含未录入）':filters.price_mode==='missing'?'未录入售价':`${filters.currency} ${min===null?'不限':number(min/100)}–${max===null?'不限':number(max/100)}（参考售价）`
  const scope=`${filters.from} 至 ${filters.to} · ${filters.category==='all'?'全部产品':filters.category} · ${priceScope}`
  const known=rows.reduce((n,row)=>n+row.recorded_rows.slice(start,end+1).reduce((a,b)=>a+b,0),0),possible=rows.reduce((n,row)=>n+row.source_rows*monthCount,0)
  const missingPrices=base.filter(row=>!priceMap.has(row.id)).length
  const notes:string[]=[]
  if(missingPrices)notes.push(`所选类型有 ${missingPrices} 个型号汇总未录入售价${filters.price_mode==='range'?'，已排除在售价区间统计之外':'，不推算售价或销售额'}。`)
  if(filters.price_mode==='range')notes.push('售价区间按当前维护的参考售价筛选，不代表历史成交价；不同币种不混算。')
  if(possible&&known<possible)notes.push(`所选范围 ${number(possible)} 个明细月份格中，${number(known)} 个已录入，${number(possible-known)} 个空缺；空缺不按 0 计算，月份差异不作为真实增长或衰退结论。`)
  if(rows.some(row=>row.missing_model))notes.push(`未标注型号的 ${number(rows.filter(row=>row.missing_model).reduce((n,row)=>n+sum(row),0))} 件保留在总量中，不参与型号排名。`)
  const points:SalesConclusion['points']=[]
  const hasRecords=rows.some(row=>row.monthly_units.slice(start,end+1).some(value=>value!==null))
  if(!rows.length||!hasRecords){points.push({title:'暂无可生成结论的数据',text:!rows.length?(filters.price_mode==='range'?'该售价区间没有已维护售价的匹配产品，请补充售价或调整筛选。':'该范围没有匹配产品。'):'匹配产品在所选月份尚未录入销量。'});return {scope,total,models,rows,points,notes,empty:true}}
  points.push({title:'销量规模',text:`所选范围已录入 ${number(total)} 件，覆盖 ${models} 个已标注型号${rows.some(row=>row.missing_model)?'及未标注型号汇总':''}。`})
  if(total>0){
    const categories=[...new Set(rows.map(row=>row.category))].map(category=>({category,total:rows.filter(row=>row.category===category).reduce((n,row)=>n+sum(row),0)})).sort((a,b)=>b.total-a.total||a.category.localeCompare(b.category))
    const lead=categories[0]
    points.push({title:'产品结构',text:`${lead.category}已录入 ${number(lead.total)} 件，占所选销量 ${percent(lead.total/total)}${categories.length>1?'，是销量最高的产品类型':''}。`})
    const ranked=rows.filter(row=>!row.missing_model&&sum(row)>0).sort((a,b)=>sum(b)-sum(a)||a.model.localeCompare(b.model))
    if(ranked.length){const first=ranked[0],top=ranked.slice(0,3),topTotal=top.reduce((n,row)=>n+sum(row),0);points.push({title:'重点型号',text:`${first.model}销量最高，已录入 ${number(sum(first))} 件，占 ${percent(sum(first)/total)}。${top.length>1?`前 ${top.length} 个型号（${top.map(row=>row.model).join('、')}）合计占 ${percent(topTotal/total)}。`:''}`})}
    const monthly=data.months.slice(start,end+1).map((month,i)=>({month,total:rows.reduce((n,row)=>n+(row.monthly_units[start+i]??0),0)})),peak=Math.max(...monthly.map(row=>row.total)),peaks=monthly.filter(row=>row.total===peak)
    points.push({title:'时间分布',text:`${peaks.map(row=>row.month).join('、')}为已录入销量峰值${peaks.length>1?'（并列）':''}，${peaks.length>1?'每月':'当月'} ${number(peak)} 件，占所选累计销量 ${percent(peak/total)}。`})
    if(monthCount>1&&known===possible){const first=monthly[0],last=monthly.at(-1)!;points.push({title:'首末月比较',text:first.total>0?`${last.month}较 ${first.month} ${last.total>=first.total?'增加':'减少'} ${percent(Math.abs(last.total-first.total)/first.total)}（${number(first.total)} → ${number(last.total)} 件）。`:`${first.month}已录入 0 件，${last.month}已录入 ${number(last.total)} 件，不计算增长百分比。`})}
  }else points.push({title:'已录入结果',text:'所选月份的已录入销量为 0 件；尚未录入的格子仍为空缺。'})
  return {scope,total,models,rows,points,notes,empty:false}
}

export const salesPriceStorageKey='impetus-sales-reference-prices-v1'
export function previewSalesPrices(path:string,method:string,body:unknown,data:SalesDataset,storage:Pick<Storage,'getItem'|'setItem'>):SalesPrice[]|SalesPrice|null{
  const raw=storage.getItem(salesPriceStorageKey),prices:SalesPrice[]=raw?JSON.parse(raw):[]
  if(!Array.isArray(prices)||prices.some(row=>!row||!['USD','CNY'].includes(row.currency)||!Number.isSafeInteger(row.amount_cents)||row.amount_cents<0))throw new Error('售价记录格式有误')
  if(path==='/sales-prices'&&method==='GET')return prices
  const match=path.match(/^\/sales-prices\/([^/]+)$/)
  if(!match||method!=='PUT')throw new Error('售价接口不存在')
  const product=data.products.find(row=>row.id===match[1]&&!row.missing_model)
  if(!product)throw new Error('销售型号不存在')
  const value=body as {currency?:string;amount_cents?:number|null}
  if(!value||!['USD','CNY'].includes(value.currency||'')||value.amount_cents!==null&&(!Number.isSafeInteger(value.amount_cents)||value.amount_cents!<0||value.amount_cents!>1000000000))throw new Error('请填写有效币种及售价')
  const price=value.amount_cents===null?null:{product_id:product.id,currency:value.currency as 'USD'|'CNY',amount_cents:value.amount_cents!}
  const next=prices.filter(row=>row.product_id!==product.id);if(price)next.push(price)
  storage.setItem(salesPriceStorageKey,JSON.stringify(next));return price
}
