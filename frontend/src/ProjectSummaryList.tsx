import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Search, SlidersHorizontal, X } from 'lucide-react'
import SemanticTag from './SemanticTag'
import { summaryDeadline, summaryProjects } from './project-summary'
import type { DeadlineSort } from './project-summary'
import type { Project } from './types'
import type { ReactNode } from 'react'

type Props={projects:Project[];allProjects:Project[];query:string;stage:string;today:string;activeFilter:boolean;advancedFilters:ReactNode;onQuery:(value:string)=>void;onStage:(value:string)=>void;onReset:()=>void;onDetails:(id:string)=>void;onEdit:(project:Project)=>void}
export default function ProjectSummaryList({projects,allProjects,query,stage,today,activeFilter,advancedFilters,onQuery,onStage,onReset,onDetails,onEdit}:Props) {
  const [advanced,setAdvanced]=useState(false)
  const [sort,setSort]=useState<DeadlineSort>('original')
  const rows=summaryProjects(projects,stage,sort)
  const scroll=useRef<HTMLDivElement>(null)
  useEffect(()=>{scroll.current?.scrollTo({top:0})},[stage,query,sort,rows.length])
  const stages=[...new Set(allProjects.map(project=>project.stage))]
  return <section className="simple-projects" aria-label="简洁项目列表">
    <div className="simple-project-toolbar"><label className="search-field"><Search size={16}/><input aria-label="搜索项目" placeholder="搜索项目或阶段" value={query} onChange={event=>onQuery(event.target.value)}/></label><select aria-label="按阶段筛选项目" value={stage} onChange={event=>onStage(event.target.value)}><option value="all">全部阶段</option>{stages.map(value=><option key={value} value={value}>{value}</option>)}</select><button className={`button simple-filter-button ${advanced||activeFilter?'active':''}`} aria-expanded={advanced} onClick={()=>setAdvanced(!advanced)}><SlidersHorizontal size={15}/>筛选{activeFilter&&<span className="simple-filter-dot"/>}</button>{(query||stage!=='all'||activeFilter)&&<button className="text-button" onClick={onReset}><X size={13}/>重置</button>}<span className="simple-project-count">{rows.length} 个项目</span></div>
    {(advanced||activeFilter)&&<div className="simple-advanced-filters">{advancedFilters}</div>}
    <div ref={scroll} className="simple-project-scroll" tabIndex={0} role="region" aria-label="项目阶段与截止日期"><table className="simple-project-table"><colgroup><col className="simple-name-col"/><col className="simple-stage-col"/><col className="simple-date-col"/></colgroup><thead><tr><th scope="col">项目</th><th scope="col">当前阶段</th><th scope="col" aria-sort={sort==='asc'?'ascending':sort==='desc'?'descending':'none'}><button className="simple-sort" aria-label={sort==='asc'?'按截止日期降序排序':sort==='desc'?'恢复默认项目顺序':'按截止日期升序排序'} onClick={()=>setSort(sort==='original'?'asc':sort==='asc'?'desc':'original')}>截止日期{sort==='asc'?<ArrowUp size={13}/>:sort==='desc'?<ArrowDown size={13}/>:<ArrowUpDown size={13}/>}</button></th></tr></thead><tbody>{rows.map(project=>{
      const deadline=summaryDeadline(project,today)
      return <tr key={project.id}><td><button className="simple-project-name" title={project.name} aria-label={`查看 ${project.name} 详细资料`} onClick={()=>onDetails(project.id)}>{project.name}</button></td><td><div className="simple-project-stage"><SemanticTag kind="stage" value={project.stage}/>{project.profile?.phase&&project.profile.phase!==project.stage&&<span className="simple-project-phase" title={project.profile.phase}>{project.profile.phase}</span>}</div></td><td><button className={`simple-project-deadline deadline-${deadline.tone}`} title={deadline.hint} aria-label={`编辑 ${project.name} 的阶段和截止日期，${deadline.hint}`} onClick={()=>onEdit(project)}><time dateTime={project.due_date||undefined}>{deadline.text}</time><Pencil size={13}/></button></td></tr>
    })}</tbody></table>{!rows.length&&<div className="simple-project-empty"><Search size={25}/><strong>暂无匹配项目</strong><button className="button" onClick={onReset}>重置筛选与搜索</button></div>}</div>
  </section>
}
