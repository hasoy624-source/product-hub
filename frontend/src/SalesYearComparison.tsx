import type {SalesDataset,SalesModel} from './sales-lifecycle-model'
import {compareSales} from './sales-history-model'
const number=(value:number)=>new Intl.NumberFormat('zh-CN').format(value)
export default function SalesYearComparison({data,previous,category,query,selected}:{data:SalesDataset;previous:SalesDataset;category:string;query:string;selected:SalesModel|undefined}){
  const result=compareSales(data,previous,category,query,selected?.id)
  const sources=[{year:previous.year,values:result.previousSeries,color:'#929eb9',dash:'5 4'},{year:data.year,values:result.currentSeries,color:'#606bc1',dash:undefined}]
  const max=Math.max(...sources.flatMap(source=>source.values.map(value=>value??0)),1),left=58,top=18,bottom=184,width=700,height=220,step=(width-left-20)/Math.max(result.length-1,1)
  return <div className="sales-comparison-chart"><div className="sales-legend">{sources.map(source=><span key={source.year}><i style={{background:source.color}}/>{source.year} 年 · 1–{result.length} 月</span>)}</div><svg className="sales-units-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${selected?.model||'所选产品'}同期已录入销量：${sources.map(source=>`${source.year} 年 ${source.values.map((value,index)=>`${index+1}月 ${value===null?'未录入':number(value)+'件'}`).join('；')}`).join('。')}`}>
    {[0,.5,1].map(part=><g key={part}><line x1={left} x2={width-20} y1={bottom-(bottom-top)*part} y2={bottom-(bottom-top)*part} stroke="#e6eaf1" strokeDasharray="3 4"/><text x={left-9} y={bottom-(bottom-top)*part+4} textAnchor="end">{number(Math.round(max*part))}</text></g>)}
    {sources.map(source=>{const points=source.values.map((value,index)=>value===null?null:[left+(result.length===1?(width-left-20)/2:step*index),bottom-value/max*(bottom-top)]),segments:string[]=[];let path='';for(const point of points){if(!point){if(path)segments.push(path);path='';continue}path+=`${path?' L':'M'}${point[0]},${point[1]}`};if(path)segments.push(path);return <g key={source.year}>{segments.map((path,index)=><path key={index} d={path} fill="none" stroke={source.color} strokeWidth="2.5" strokeDasharray={source.dash}/>)}{points.map((point,index)=>point&&<circle key={index} cx={point[0]} cy={point[1]} r="3.5" fill="#fff" stroke={source.color} strokeWidth="2"><title>{source.year} 年 {index+1} 月：{number(source.values[index]!)} 件</title></circle>)}</g>})}
    {Array.from({length:result.length},(_,index)=><text key={index} x={left+(result.length===1?(width-left-20)/2:step*index)} y={height-13} textAnchor="middle">{index+1}月</text>)}
  </svg></div>
}
