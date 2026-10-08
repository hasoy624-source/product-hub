import {useState} from 'react'
import {X,ChevronDown} from 'lucide-react'
import {categoryTone,semanticPalette} from './semantics'
import {donutPath} from './sales-pie-model'
import type {SalesConclusion} from './sales-conclusions-model'
const number=(value:number)=>new Intl.NumberFormat('zh-CN').format(value)
const percent=(value:number)=>`${(value*100).toFixed(1)}%`
export default function SalesConclusionPie({report,stale}:{report:SalesConclusion;stale:boolean}){
  const [selected,setSelected]=useState(''),[all,setAll]=useState(false)
  const selectedShare=report.shares.find(row=>row.category===selected),rows=report.products.filter(row=>!selected||row.category===selected)
  const positive=report.shares.filter(row=>row.units>0),paths:{category:string;path:string}[]=[];let angle=-Math.PI/2
  for(const row of positive){const end=angle+row.share*Math.PI*2;paths.push({category:row.category,path:donutPath(angle,end)});angle=end}
  function choose(category:string){setSelected(selected===category?'':category);setAll(false)}
  return <div className="conclusion-pie-content">
    <div className="conclusion-pie-layout"><figure><figcaption>品类销量占比</figcaption><svg viewBox="0 0 260 260" role="group" aria-label="销售品类占比饼图">
      {!paths.length&&<circle cx="130" cy="130" r="89" fill="none" stroke="#e6eaf1" strokeWidth="38"/>}
      {paths.map(row=>{const share=report.shares.find(item=>item.category===row.category)!;return <path key={row.category} d={row.path} fill={semanticPalette[categoryTone(row.category)].solid} fillRule="evenodd" stroke="#fff" strokeWidth={selected===row.category?3:1.5} tabIndex={stale?-1:0} role="button" aria-label={`查看${row.category}型号，${number(share.units)}件，占比${percent(share.share)}`} aria-pressed={selected===row.category} aria-disabled={stale} onClick={()=>{if(!stale)choose(row.category)}} onKeyDown={event=>{if(!stale&&['Enter',' '].includes(event.key)){event.preventDefault();choose(row.category)}}}><title>{row.category} · {number(share.units)} 件 · {percent(share.share)}</title></path>})}
      <text className="pie-center-label" x="130" y="112" textAnchor="middle">{selectedShare?.category||'已录入销量'}</text><text className="pie-center-value" x="130" y="144" textAnchor="middle">{report.empty?'—':number(selectedShare?.units??report.total)}</text><text className="pie-center-unit" x="130" y="165" textAnchor="middle">件</text>
    </svg>{!paths.length&&<p className="pie-empty">{report.empty?'暂无匹配的已录入数据':'已录入为 0，暂无销量占比'}</p>}</figure>
    <div className="conclusion-pie-legend"><div className="pie-legend-head"><span>产品类型</span><span>已录入件数 / 占比</span></div>{report.shares.map(row=><button key={row.category} className={selected===row.category?'selected':''} disabled={stale} aria-pressed={selected===row.category} onClick={()=>choose(row.category)} aria-label={`查看${row.category}型号明细`}><span><i style={{background:semanticPalette[categoryTone(row.category)].solid}}/>{row.category}<small>{row.models} 个型号汇总</small></span><strong>{number(row.units)}<small>{percent(row.share)}</small></strong></button>)}{report.empty&&<p>{report.points[0]?.text}</p>}<div className="pie-total"><span>所选范围合计</span><strong>{report.empty?'—':number(report.total)+' 件'}</strong></div></div></div>
    {selected&&<section className="pie-model-detail" aria-label={`${selected}销量明细`}><header><h4>{selected} · 型号销量</h4><button className="text-button" onClick={()=>setSelected('')}><X size={14}/>收起明细</button></header><div className="pie-model-scroll"><table><thead><tr><th>型号</th><th>已录入销量</th><th>该类占比</th></tr></thead><tbody>{rows.slice(0,all?rows.length:8).map(row=><tr key={row.id}><td>{row.model}</td><td>{number(row.units)} 件</td><td>{percent(selectedShare?.units?row.units/selectedShare.units:0)}</td></tr>)}</tbody></table></div>{rows.length>8&&!all&&<button className="text-button" onClick={()=>setAll(true)}>展开该类全部 {rows.length} 个型号<ChevronDown size={14}/></button>}</section>}
  </div>
}
