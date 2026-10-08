import {useEffect,useState,useRef} from 'react'
import {ArrowRight,Search,X} from 'lucide-react'
import {api} from './api'
import SemanticTag from './SemanticTag'
import {categoryTone,semanticPalette} from './semantics'
import {salesCategories,salesRows,salesSeries,salesTotal,recordedLife,matchedSalesProject} from './sales-lifecycle-model'
import {projectSheetHref} from './project-links'
import type {SalesDataset,SalesModel} from './sales-lifecycle-model'
import type {Project} from './types'

const number=(value:number)=>new Intl.NumberFormat('zh-CN').format(value)
const color=(category:string)=>category==='待分类'?'#8290a6':semanticPalette[categoryTone(category)].solid
function UnitsChart({data,rows,selected}:{data:SalesDataset;rows:SalesModel[];selected:SalesModel|undefined}){
  const source=selected?[selected]:rows,series=salesSeries(source,data.months.length),max=Math.max(...series.map(value=>value??0),1)
  const width=700,height=220,left=58,top=15,bottom=184,plot=width-left-15,step=plot/data.months.length
  const bars=selected?[]:salesCategories.map(category=>({category,values:salesSeries(source.filter(row=>row.category===category),data.months.length)}))
  if(!source.some(row=>row.monthly_units.some(value=>value!==null)))return <div className="sales-chart-empty">暂无已录入销量</div>
  const points=series.map((value,index)=>value===null?null:[left+step*(index+.5),bottom-value/max*(bottom-top)])
  const segments:string[]=[];let path=''
  for(const point of points){if(!point){if(path)segments.push(path);path='';continue}path+=`${path?' L':'M'}${point[0]},${point[1]}`};if(path)segments.push(path)
  return <svg className="sales-units-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${selected?.model||'全部产品'}月度已录入销量：${data.months.map((month,index)=>`${month} ${series[index]===null?'未录入':number(series[index]!)+'件'}`).join('；')}`}>
    {[0,.5,1].map(part=><g key={part}><line x1={left} x2={width-15} y1={bottom-(bottom-top)*part} y2={bottom-(bottom-top)*part} stroke="#e6eaf1" strokeDasharray="3 4"/><text x={left-9} y={bottom-(bottom-top)*part+4} textAnchor="end">{number(Math.round(max*part))}</text></g>)}
    {!selected&&data.months.map((month,index)=>{let offset=0;return <g key={month}>{bars.map(bar=>{const value=bar.values[index]??0,y=bottom-(offset+value)/max*(bottom-top);offset+=value;return value>0&&<rect key={bar.category} x={left+step*index+step*.22} y={y} width={step*.56} height={value/max*(bottom-top)} fill={color(bar.category)} rx="2"><title>{month} · {bar.category} · 已录入 {number(value)} 件</title></rect>})}</g>})}
    {selected&&segments.map((path,index)=><path key={index} d={path} fill="none" stroke={color(selected.category)} strokeWidth="2.5" strokeLinejoin="round"/>)}
    {selected&&points.map((point,index)=>point&&<circle key={index} cx={point[0]} cy={point[1]} r="4" fill={color(selected.category)}><title>{data.months[index]} · {number(series[index]!)} 件</title></circle>)}
    {data.months.map((month,index)=><text key={month} x={left+step*(index+.5)} y={height-13} textAnchor="middle">{Number(month.slice(5))}月</text>)}
  </svg>
}
export default function SalesLifecycle({projects,onReady}:{projects:Project[];onReady:(available:boolean)=>void}){
  const panel=useRef<HTMLElement>(null)
  function selectProduct(id:string){setSelectedId(id);panel.current?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
  const [data,setData]=useState<SalesDataset|null>(null),[error,setError]=useState(''),[category,setCategory]=useState('all'),[query,setQuery]=useState(''),[selectedId,setSelectedId]=useState('')
  useEffect(()=>{let active=true;void api<SalesDataset|null>('/sales-lifecycle').then(value=>{if(active){setData(value);onReady(Boolean(value))}}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'销量读取失败')});return()=>{active=false}},[onReady])
  if(error)return <section className="sales-lifecycle ops-surface"><h2>产品生命周期与销量</h2><p className="form-error" role="alert">{error}</p></section>
  if(!data)return null
  const rows=salesRows(data,category,query),selected=rows.find(row=>row.id===selectedId),life=selected?recordedLife(selected,data.months):null,project=selected?matchedSalesProject(selected,projects):undefined
  const monthly=salesSeries(rows,data.months.length),total=rows.reduce((sum,row)=>sum+salesTotal(row),0),peak=Math.max(...monthly.map(value=>value??0),0),peakIndex=monthly.findIndex(value=>value===peak)
  return <section ref={panel} className="sales-lifecycle ops-surface" aria-label="产品生命周期与销量">
    <header className="sales-panel-head"><div><h2>产品生命周期与销量</h2><span>{data.year} 年 1–{data.through_month} 月 · 件</span></div><label className="sales-search"><Search size={15}/><input aria-label="搜索销售产品" placeholder="搜索型号" value={query} onChange={event=>{setQuery(event.target.value);setSelectedId('')}}/></label></header>
    <div className="sales-category-tabs" role="group" aria-label="销量品类筛选">{['all',...salesCategories].map(value=><button key={value} aria-pressed={category===value} className={category===value?'selected':''} onClick={()=>{setCategory(value);setSelectedId('')}}>{value==='all'?'全部产品':value}<span>{value==='all'?data.products.length:data.products.filter(row=>row.category===value).length}</span></button>)}</div>
    <div className="sales-summary"><div><span>已录入销量</span><strong>{number(total)}<small> 件</small></strong></div><div><span>已标注型号</span><strong>{rows.filter(row=>!row.missing_model).length}<small> 款</small></strong></div><div><span>峰值月份</span><strong>{rows.length&&peakIndex>=0?Number(data.months[peakIndex].slice(5))+'月':'—'}<small>{rows.length?' · '+number(peak)+' 件':''}</small></strong></div></div>
    <div className="sales-chart-layout"><div className="sales-trend-panel"><div className="sales-chart-heading"><h3>{selected?selected.model:'月度销量'}</h3>{selected?<button className="text-button" onClick={()=>setSelectedId('')}><X size={14}/>返回汇总</button>:<div className="sales-legend">{salesCategories.filter(value=>rows.some(row=>row.category===value)).map(value=><span key={value}><i style={{background:color(value)}}/>{value}</span>)}</div>}</div><UnitsChart data={data} rows={rows} selected={selected}/></div>
    <aside className="sales-life-inspector"><h3>生命周期观察</h3>{selected&&life?<><div className="sales-selected-model"><strong>{selected.model}</strong><SemanticTag kind="category" value={selected.category}/></div><dl><div><dt>首笔观测记录</dt><dd>{life.first||'未录入'}</dd></div><div><dt>最近观测记录</dt><dd>{life.last||'未录入'}</dd></div><div><dt>记录月份</dt><dd>{life.recordedMonths} / {data.through_month}</dd></div><div><dt>已录入累计销量</dt><dd>{number(life.total)} 件</dd></div><div><dt>研发阶段</dt><dd>{project?<SemanticTag kind="stage" value={project.stage}/>:'未关联项目'}</dd></div></dl>{project&&<a className="text-button" href={projectSheetHref(project.id)}>对应研发项目<ArrowRight size={14}/></a>}</>:<><div className="sales-life-key"><span className="sales-known-swatch"/>已录入销量<span className="sales-missing-swatch">—</span>尚未录入</div><dl><div><dt>有销量记录的型号</dt><dd>{rows.filter(row=>salesTotal(row)>0&&!row.missing_model).length} 款</dd></div><div><dt>待补型号的记录</dt><dd>{data.missing_model_records} 条</dd></div></dl></>}</aside></div>
    <div className="sales-heatmap-head"><h3>产品生命周期轨迹</h3><span>已录入销量 · 空白保留为未录入</span></div>
    <div className="sales-heatmap-scroll" tabIndex={0} role="region" aria-label="产品生命周期销量表"><table className="sales-heatmap"><thead><tr><th>产品型号 / 品类</th>{data.months.map(month=><th key={month}>{Number(month.slice(5))}月</th>)}<th>已录入累计</th></tr></thead><tbody>{rows.map(row=>{const max=Math.max(...row.monthly_units.map(value=>value??0),1);return <tr key={row.id} className={row.id===selectedId?'selected':''}><th><button onClick={()=>selectProduct(row.id)} aria-label={`查看 ${row.model} 销量生命周期`}><strong>{row.model}</strong><span>{row.category}</span></button></th>{row.monthly_units.map((quantity,index)=><td key={index} title={`${row.model} ${data.months[index]}：${quantity===null?'尚未录入':number(quantity)+'件；'+row.recorded_rows[index]+'/'+row.source_rows+'条记录已填'}`}><button onClick={()=>selectProduct(row.id)} tabIndex={-1} className={quantity===null?'sales-cell missing':'sales-cell'} style={quantity===null?undefined:{background:`color-mix(in srgb, ${color(row.category)} ${12+(quantity/max)*30}%, white)`}} aria-label={`${row.model} ${data.months[index]} ${quantity===null?'未录入':quantity+'件'}`}>{quantity===null?'—':number(quantity)}</button></td>)}<td className="sales-row-total">{number(salesTotal(row))}</td></tr>})}</tbody></table>{!rows.length&&<div className="workbook-table-empty">暂无匹配型号</div>}</div>
  </section>
}
