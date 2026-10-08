import {useEffect,useState} from 'react'
import {ChevronDown,ChevronUp,FileText,Copy,Check} from 'lucide-react'
import {api} from './api'
import {visibleProductTypeNames} from './product-taxonomy-model'
import type {SalesDataset} from './sales-lifecycle-model'
import {defaultConclusionFilters,generateSalesConclusion,priceCents} from './sales-conclusions-model'
import type {ConclusionFilters,SalesConclusion,SalesPrice} from './sales-conclusions-model'
import './sales-conclusions.css'
import SalesConclusionPie from './SalesConclusionPie'

export default function SalesConclusions({data,previous}:{data:SalesDataset;previous?:SalesDataset}){
  const [open,setOpen]=useState(false),[filters,setFilters]=useState(()=>defaultConclusionFilters(data)),[prices,setPrices]=useState<SalesPrice[]>([]),[loaded,setLoaded]=useState(false),[error,setError]=useState('')
  const [report,setReport]=useState<SalesConclusion|null>(null),[stale,setStale]=useState(false),[copied,setCopied]=useState(false),[saving,setSaving]=useState(false)
  const [model,setModel]=useState(''),[currency,setCurrency]=useState<'USD'|'CNY'>('USD'),[amount,setAmount]=useState(''),[saved,setSaved]=useState('')
  useEffect(()=>{let active=true;void api<SalesPrice[]>('/sales-prices').then(value=>{if(active){setPrices(value);setLoaded(true)}}).catch(cause=>{if(active)setError(cause.message)});return()=>{active=false}},[])
  function generate(){setError('');setCopied(false);try{setReport(generateSalesConclusion(data,filters,prices,previous));setStale(false)}catch(cause){setError((cause as Error).message)}}
  function toggle(){if(!open&&!report&&loaded)generate();setOpen(!open)}
  function update<K extends keyof ConclusionFilters>(key:K,value:ConclusionFilters[K]){setFilters({...filters,[key]:value});setStale(true);setCopied(false)}
  function selectModel(id:string){const price=prices.find(row=>row.product_id===id);setModel(id);setCurrency(price?.currency||'USD');setAmount(price?(price.amount_cents/100).toFixed(2):'');setSaved('')}
  async function savePrice(clear=false){setError('');setSaved('');try{if(!model)throw new Error('请先选择产品型号');const cents=clear?null:priceCents(amount);if(!clear&&cents===null)throw new Error('请填写参考售价');setSaving(true);const price=await api<SalesPrice|null>(`/sales-prices/${model}`,'PUT',{currency,amount_cents:cents});setPrices(previous=>[...previous.filter(row=>row.product_id!==model),...(price?[price]:[])]);if(clear)setAmount('');setStale(true);setSaved(clear?'已清除售价':'售价已保存')}catch(cause){setError((cause as Error).message)}finally{setSaving(false)}}
  async function copyReport(){if(!report)return;try{await navigator.clipboard.writeText([`销售结论\n${report.scope}`,...report.shares.map(row=>`${row.category}：${row.units.toLocaleString('zh-CN')} 件，占比 ${(row.share*100).toFixed(1)}%`),...report.points.map(point=>`${point.title}：${point.text}`),...report.notes].join('\n\n'));setCopied(true)}catch{setError('复制未完成，请选择结论文本复制')}}
  return <div className={`sales-conclusions ${open?'open':''}`}>
    <button className="conclusion-toggle" onClick={toggle} aria-expanded={open} aria-controls="sales-conclusion-panel"><FileText size={16}/><span>销售结论</span>{open?<ChevronUp size={15}/>:<ChevronDown size={15}/>}</button>
    {open&&<div id="sales-conclusion-panel">
      <form className="conclusion-filters" onSubmit={event=>{event.preventDefault();generate()}}>
        <label>开始月份<select aria-label="开始月份" value={filters.from} onChange={event=>update('from',event.target.value)}>{data.months.map(month=><option key={month}>{month}</option>)}</select></label>
        <label>结束月份<select aria-label="结束月份" value={filters.to} onChange={event=>update('to',event.target.value)}>{data.months.map(month=><option key={month}>{month}</option>)}</select></label>
        <label>产品类型<select aria-label="产品类型" value={filters.category} onChange={event=>update('category',event.target.value)}><option value="all">全部产品</option>{visibleProductTypeNames(data.products).map(category=><option key={category}>{category}</option>)}</select></label>
        <label>售价区间<select aria-label="售价区间" value={filters.price_mode} onChange={event=>update('price_mode',event.target.value as ConclusionFilters['price_mode'])}><option value="all">全部（含未录入）</option><option value="range">自定义区间</option><option value="missing">未录入售价</option></select></label>
        {filters.price_mode==='range'&&<><label>筛选币种<select aria-label="筛选币种" value={filters.currency} onChange={event=>update('currency',event.target.value as 'USD'|'CNY')}><option value="USD">USD 美元</option><option value="CNY">CNY 人民币</option></select></label><label>最低参考售价<input aria-label="最低参考售价" inputMode="decimal" placeholder="不限" value={filters.min} onChange={event=>update('min',event.target.value)}/></label><label>最高参考售价<input aria-label="最高参考售价" inputMode="decimal" placeholder="不限" value={filters.max} onChange={event=>update('max',event.target.value)}/></label></>}
        <button className="button primary" type="submit" disabled={!loaded}>生成结论</button>
      </form>
      {error&&<p className="form-error" role="alert">{error}</p>}
      {report&&<article className={`conclusion-report ${stale?'stale':''}`} aria-label="销售分析结论" aria-live="polite"><header><div><h3>{stale?'筛选已变更，待重新生成':'销售分析结论'}</h3><p>{report.scope}</p></div><button type="button" className="text-button" disabled={stale} onClick={()=>void copyReport()}>{copied?<Check size={14}/>:<Copy size={14}/>}<span>{copied?'已复制':'复制结论'}</span></button></header><SalesConclusionPie key={report.scope+JSON.stringify(report.shares)} report={report} stale={stale}/><details className="conclusion-text-details"><summary>详细结论</summary><ol>{report.points.map((point,index)=><li key={point.title}><span className="conclusion-index">{String(index+1).padStart(2,'0')}</span><div><h4>{point.title}</h4><p>{point.text}</p></div></li>)}</ol></details>{report.notes.length>0&&<details className="conclusion-notes" open={report.empty}><summary>数据口径与缺失项 · {report.notes.length}</summary>{report.notes.map(note=><p key={note}>{note}</p>)}</details>}</article>}
      <details className="conclusion-price-editor"><summary>维护参考售价 <span>{prices.length} 个型号已维护</span></summary><form onSubmit={event=>{event.preventDefault();void savePrice()}}><label>产品型号<select aria-label="售价产品型号" value={model} onChange={event=>selectModel(event.target.value)}><option value="">选择型号</option>{data.products.filter(row=>!row.missing_model).slice().sort((a,b)=>a.model.localeCompare(b.model)).map(row=><option key={row.id} value={row.id}>{row.model} · {row.category}</option>)}</select></label><label>售价币种<select aria-label="售价币种" value={currency} onChange={event=>{setCurrency(event.target.value as 'USD'|'CNY');setSaved('')}}><option value="USD">USD 美元</option><option value="CNY">CNY 人民币</option></select></label><label>参考售价 / 件<input aria-label="参考售价 / 件" inputMode="decimal" value={amount} onChange={event=>{setAmount(event.target.value);setSaved('')}} placeholder="未录入"/></label><button type="submit" className="button" disabled={saving||!loaded}>保存售价</button><button type="button" className="text-button" disabled={saving||!model} onClick={()=>void savePrice(true)}>清除售价</button></form><p role="status">{saved||'参考售价用于区间筛选，不作为历史成交价或销售额。'}{import.meta.env.VITE_PREVIEW_MODE==='true'?' · 当前预览保存在本浏览器':''}</p></details>
    </div>}
  </div>
}
