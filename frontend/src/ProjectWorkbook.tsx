import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Columns3, FileText, Image as ImageIcon, Plus, Search, Settings2, UserRound, X } from 'lucide-react'
import { api } from './api'
import SemanticTag from './SemanticTag'
import { categoryTone, stageTone, toneStyle } from './semantics'
import { emptyMilestone } from './project-native'
import { summaryDeadline } from './project-summary'
import { knowledgeTemplates } from './knowledge-catalog'
import { defaultWorkbookColumns, linkedNodeDocuments, nextWorkbookLimit, projectWorkbookGroups, workbookCategory, workbookColumns, workbookNodeTone, workbookPageSize, workbookStages } from './project-workbook-model'
import type { WorkbookColumn } from './project-workbook-model'
import type { Project, ProjectDetails, ProjectMilestone, Workspace, KnowledgeDocument } from './types'
import type { FormEvent } from 'react'

const preferenceKey='zhixu-project-workbook-columns-v1'
type Editable='name'|'owner'|'planned_end'|'deliverable'|'priority'|'document_ids'
type Editing={project:Project;node:ProjectMilestone|null;field:Editable|'new'}
const fieldNames:Record<Editable,string>={name:'项目节点',owner:'节点负责人',planned_end:'节点截止日期',deliverable:'输出产物',priority:'节点优先级',document_ids:'相关文档'}

function NodeEditor({editing,workspace,onClose,onSaved,onDocuments}:{editing:Editing;workspace:Workspace;onClose:()=>void;onSaved:()=>Promise<void>;onDocuments:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const [value,setValue]=useState(editing.node&&editing.field!=='new'?String(editing.node[editing.field]||''):'')
  const [date,setDate]=useState('')
  const [selected,setSelected]=useState<string[]>(editing.node?.document_ids||[])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const docs=workspace.knowledge_documents.filter(doc=>doc.project_id===editing.project.id)
  useEffect(()=>{const focus=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();focus?.focus({preventScroll:true})}},[])
  async function save(event:FormEvent){
    event.preventDefault();setBusy(true);setError('')
    try{
      const body=editing.field==='new'?{...emptyMilestone(),name:value,planned_end:date,sort_order:10000}:editing.field==='document_ids'?{document_ids:selected}:{[editing.field]:value}
      await api(`/projects/${editing.project.id}/milestones${editing.node?'/'+editing.node.id:''}`,editing.node?'PATCH':'POST',body)
      await onSaved();onClose()
    }catch(cause){setError(cause instanceof Error?cause.message:'保存失败')}finally{setBusy(false)}
  }
  return <dialog ref={dialog} className="editor workbook-cell-editor" onCancel={event=>{if(busy)event.preventDefault();else onClose()}} aria-label={editing.field==='new'?'添加项目节点':`编辑${fieldNames[editing.field]}`}><form onSubmit={save}><div className="dialog-head"><div><h2>{editing.field==='new'?'添加项目节点':fieldNames[editing.field]}</h2><span className="workbook-edit-context">{editing.project.name}{editing.node&&` · ${editing.node.name}`}</span></div><button type="button" className="icon-button" aria-label="关闭节点编辑" onClick={onClose} disabled={busy}><X size={18}/></button></div><div className="form-body workbook-cell-form">
    {editing.field==='document_ids'?<><div className="workbook-document-picker">{docs.map(doc=><label key={doc.id}><input type="checkbox" checked={selected.includes(doc.id)} onChange={event=>setSelected(ids=>event.target.checked?[...ids,doc.id]:ids.filter(id=>id!==doc.id))}/><FileText size={15}/><span>{doc.title}</span><small>{doc.status}</small></label>)}{!docs.length&&<div className="workbook-no-documents">暂无项目文档<button type="button" className="text-button" onClick={onDocuments}>创建阶段文档</button></div>}</div></>:editing.field==='priority'?<div className="field full"><label htmlFor="workbook-cell-value">优先级</label><select id="workbook-cell-value" value={value} onChange={event=>setValue(event.target.value)}><option value="">未设置</option>{['低','中','高','S+'].map(item=><option key={item}>{item}</option>)}</select></div>:<div className="field full"><label htmlFor="workbook-cell-value">{editing.field==='new'?'节点名称':fieldNames[editing.field]}</label><input autoFocus id="workbook-cell-value" type={editing.field==='planned_end'?'date':'text'} required={editing.field==='name'||editing.field==='new'} maxLength={editing.field==='owner'?100:200} value={value} list={editing.field==='deliverable'?'workbook-deliverables':undefined} onInput={editing.field==='planned_end'?event=>setValue(event.currentTarget.value):undefined} onChange={event=>setValue(event.target.value)}/>{editing.field==='deliverable'&&<datalist id="workbook-deliverables">{knowledgeTemplates.map(template=><option key={template.id} value={template.title}/>)}</datalist>}</div>}
    {editing.field==='new'&&<div className="field full"><label htmlFor="workbook-new-date">截止日期</label><input id="workbook-new-date" type="date" value={date} onInput={event=>setDate(event.currentTarget.value)} onChange={event=>setDate(event.target.value)}/></div>}
    </div>{error&&<p className="form-error editor-error" role="alert">{error}</p>}<div className="dialog-footer"><button className="button" type="button" onClick={onClose} disabled={busy}>取消</button><button className="button primary" disabled={busy}>{busy?'保存中…':'保存节点'}</button></div></form></dialog>
}

function DocumentReader({document,onClose}:{document:KnowledgeDocument;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close()},[])
  return <dialog ref={dialog} className="workbook-document-reader" aria-label={document.title} onCancel={onClose}><div className="dialog-head"><h2>{document.title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭关联文档"><X size={18}/></button></div><pre>{document.content||'文档尚未填写正文'}</pre></dialog>
}

function ProjectSheet({project,workspace,columns,today,onDetails,onChanged,onDocuments}:{project:Project;workspace:Workspace;columns:WorkbookColumn[];today:string;onDetails:(id:string)=>void;onChanged:()=>Promise<void>;onDocuments:()=>void}) {
  const [data,setData]=useState<ProjectDetails|null>(workspace.project_details?.[project.id]||null)
  const [collapsed,setCollapsed]=useState(true)
  const [expanded,setExpanded]=useState(false)
  const [editing,setEditing]=useState<Editing|null>(null)
  const [document,setDocument]=useState<KnowledgeDocument|null>(null)
  const [error,setError]=useState('')
  const load=useCallback(async()=>{try{setData(await api<ProjectDetails>(`/projects/${project.id}/details`));setError('')}catch(cause){setError(cause instanceof Error?cause.message:'节点读取失败')}},[project.id])
  useEffect(()=>{if(workspace.project_details?.[project.id])setData(workspace.project_details[project.id]);else void load()},[workspace,project.id,load])
  const nodes=data?.milestones||[]
  const shown=expanded?nodes:nodes.slice(0,5)
  const category=workbookCategory(workspace,project.id)
  const image=data?.images[0]
  const imageURL=image?.url||(image?`/api/project-assets/${image.filename}`:'')
  const selectedColumns=workbookColumns.filter(column=>columns.includes(column.key))
  const minWidth=48+selectedColumns.reduce((sum,column)=>sum+column.width,0)
  const edit=(node:ProjectMilestone,field:Editable)=>setEditing({project,node,field})
  const afterSave=async()=>{await Promise.all([load(),onChanged()])}
  return <section className="workbook-project-sheet" style={{width:minWidth+2,minWidth:minWidth+2}} aria-label={`${project.name} 节点工作表`}>
    <header className="workbook-sheet-heading"><button className="workbook-collapse" onClick={()=>setCollapsed(!collapsed)} aria-expanded={!collapsed} aria-label={`${collapsed?'展开':'收起'} ${project.name} 工作表`}>{collapsed?<ChevronRight size={16}/>:<ChevronDown size={16}/>}</button><button className="workbook-sheet-name" onClick={()=>onDetails(project.id)}>{project.name}</button><SemanticTag kind="stage" value={project.stage}/><span className="workbook-node-count">{nodes.length} 个节点</span><span className="workbook-project-due">项目截止 {project.due_date||'未设置'}</span><button className="text-button workbook-sheet-docs" onClick={onDocuments}><BookOpen size={14}/>阶段文档</button></header>
    {!collapsed&&<><table className="workbook-table"><colgroup><col style={{width:48}}/>{selectedColumns.map(column=><col key={column.key} style={{width:column.width}}/>)}</colgroup><thead><tr><th scope="col" className="workbook-index-cell">#</th>{selectedColumns.map(column=><th scope="col" key={column.key} className={column.key==='code'?'workbook-code-cell':''}>{column.label}</th>)}</tr></thead><tbody>{shown.map((node,index)=>{
      const deadline=summaryDeadline({...project,due_date:node.planned_end,status:node.status==='已完成'?'已完成':project.status},today)
      const docs=linkedNodeDocuments(workspace,project.id,node)
      return <tr key={node.id}><td className="workbook-index-cell">{index+1}</td>{selectedColumns.map(column=><td key={column.key} className={column.key==='code'?'workbook-code-cell':''}>
        {column.key==='code'&&<button className="workbook-code-link" onClick={()=>onDetails(project.id)}>{project.name}</button>}
        {column.key==='image'&&(imageURL?<a className="workbook-image" href={imageURL} target="_blank" rel="noreferrer" aria-label={`查看 ${project.name} 产品示意图`}><img src={imageURL} alt={`${project.name} 产品示意图`} loading="lazy"/></a>:<span className="workbook-image-placeholder"><ImageIcon size={20}/></span>)}
        {column.key==='category'&&<SemanticTag kind="category" value={category}/>}
        {column.key==='owner'&&<button className="workbook-cell-button workbook-owner" onClick={()=>edit(node,'owner')} aria-label={`编辑 ${project.name} ${node.name} 负责人`}><UserRound size={13}/>{node.owner||<span className="workbook-empty-value">未分配</span>}</button>}
        {column.key==='node'&&<button className="workbook-node-tag" style={toneStyle(workbookNodeTone(node))} onClick={()=>edit(node,'name')} aria-label={`编辑 ${project.name} 节点 ${node.name}`}>{node.name}</button>}
        {column.key==='deadline'&&<button className={`workbook-cell-button deadline-${deadline.tone}`} title={deadline.hint} onClick={()=>edit(node,'planned_end')} aria-label={`编辑 ${project.name} ${node.name} 截止日期`}>{deadline.text}</button>}
        {column.key==='deliverable'&&<button className={`workbook-cell-button ${node.deliverable?'workbook-output-tag':''}`} style={node.deliverable?toneStyle(categoryTone(node.deliverable)):undefined} onClick={()=>edit(node,'deliverable')} aria-label={`编辑 ${project.name} ${node.name} 输出产物`}>{node.deliverable||<span className="workbook-empty-value">未填写</span>}</button>}
        {column.key==='documents'&&<div className="workbook-document-cell">{docs[0]&&<button className="workbook-document-link" onClick={()=>setDocument(docs[0])}><FileText size={15}/><span>{docs[0].title}</span></button>}{docs.length>1&&<span>+{docs.length-1}</span>}<button className="workbook-associate" onClick={()=>edit(node,'document_ids')} aria-label={`关联 ${project.name} ${node.name} 文档`}>{docs.length?<Settings2 size={13}/>:'关联文档'}</button></div>}
        {column.key==='priority'&&<button className={`workbook-cell-button workbook-priority priority-${node.priority==='高'||node.priority==='S+'?'high':node.priority==='中'?'medium':'normal'}`} onClick={()=>edit(node,'priority')} aria-label={`编辑 ${project.name} ${node.name} 优先级`}>{node.priority||<span className="workbook-empty-value">未设置</span>}</button>}
        {column.key==='status'&&<SemanticTag kind="status" value={node.status}/>}
      </td>)}</tr>
    })}</tbody></table>{error&&<p className="form-error workbook-sheet-error" role="alert">{error}</p>}{!data&&!error&&<div className="workbook-table-empty">正在读取节点…</div>}{data&&!nodes.length&&<div className="workbook-table-empty">暂无节点</div>}<footer className="workbook-sheet-footer"><button className="text-button" onClick={()=>setEditing({project,node:null,field:'new'})}><Plus size={16}/>添加节点</button>{nodes.length>5&&<button className="text-button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'收起节点':`展开其余 ${nodes.length-5} 个节点`}<ChevronDown size={13}/></button>}</footer></>}
    {editing&&<NodeEditor key={`${editing.node?.id||'new'}-${editing.field}`} editing={editing} workspace={workspace} onClose={()=>setEditing(null)} onSaved={afterSave} onDocuments={()=>{setEditing(null);onDocuments()}}/>}{document&&<DocumentReader document={document} onClose={()=>setDocument(null)}/>}
  </section>
}

type Props={projects:Project[];workspace:Workspace;query:string;stage:string;today:string;activeFilter:boolean;advancedFilters:React.ReactNode;onQuery:(value:string)=>void;onStage:(value:string)=>void;onReset:()=>void;onDetails:(id:string)=>void;onChanged:()=>Promise<void>;onDocuments:(project:Project)=>void}
export default function ProjectWorkbook({projects,workspace,query,stage,today,activeFilter,advancedFilters,onQuery,onStage,onReset,onDetails,onChanged,onDocuments}:Props) {
  const [columns,setColumns]=useState<WorkbookColumn[]>(()=>{try{const saved=JSON.parse(localStorage.getItem(preferenceKey)||'null');if(Array.isArray(saved)){const known=workbookColumns.map(c=>c.key);return ['code',...saved.filter(key=>key!=='code'&&known.includes(key))] as WorkbookColumn[]}}catch{}return defaultWorkbookColumns})
  const [settings,setSettings]=useState(false)
  const [filters,setFilters]=useState(false)
  const [limit,setLimit]=useState(workbookPageSize)
  const tabButtons=useRef<Array<HTMLButtonElement|null>>([])
  const scroll=useRef<HTMLDivElement>(null)
  const loadMore=useRef<HTMLDivElement>(null)
  const allGroups=projectWorkbookGroups(projects,stage)
  let remaining=limit
  const groups=allGroups.map(group=>{const rows=group.projects.slice(0,remaining);remaining=Math.max(0,remaining-rows.length);return {...group,projects:rows}}).filter(group=>group.projects.length)
  const total=allGroups.reduce((sum,group)=>sum+group.projects.length,0)
  const sheetWidth=50+workbookColumns.filter(column=>columns.includes(column.key)).reduce((sum,column)=>sum+column.width,0)
  useEffect(()=>{setLimit(workbookPageSize);scroll.current?.scrollTo({top:0})},[query,stage])
  useEffect(()=>{
    if(!scroll.current||!loadMore.current||limit>=total)return
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting))setLimit(current=>nextWorkbookLimit(current,total))
    },{root:scroll.current,rootMargin:'160px 0px'})
    observer.observe(loadMore.current)
    return()=>observer.disconnect()
  },[limit,total,query,stage])
  useEffect(()=>{try{localStorage.setItem(preferenceKey,JSON.stringify(columns))}catch{/* View settings never overwrite business data. */}},[columns])
  function toggle(key:WorkbookColumn){if(key==='code')return;setColumns(values=>values.includes(key)?values.filter(value=>value!==key):[...values,key])}
  return <section className="project-workbook" aria-label="分阶段项目工作表">
    <div className="workbook-stage-tabs" role="tablist" aria-label="项目阶段">{['all',...workbookStages].map((value,index)=><button ref={element=>{tabButtons.current[index]=element}} tabIndex={stage===value?0:-1} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const values=['all',...workbookStages];const next=event.key==='Home'?0:event.key==='End'?values.length-1:(index+(event.key==='ArrowRight'?1:-1)+values.length)%values.length;onStage(values[next]);tabButtons.current[next]?.focus({preventScroll:true})}}} role="tab" aria-selected={stage===value} className={stage===value?'selected':''} style={value!=='all'?toneStyle(stageTone(value)):undefined} key={value} onClick={()=>onStage(value)}>{value==='all'?'全部阶段':value}<span>{value==='all'?workspace.projects.length:workspace.projects.filter(project=>project.stage===value).length}</span></button>)}</div>
    <div className="workbook-toolbar"><label className="search-field"><Search size={16}/><input aria-label="搜索项目" placeholder="搜索项目、阶段或负责人" value={query} onChange={event=>onQuery(event.target.value)}/></label><button className="button" aria-expanded={filters} onClick={()=>setFilters(!filters)}><Settings2 size={15}/>筛选</button>{(activeFilter||query||stage!=='all')&&<button className="text-button" onClick={onReset}>重置</button>}<span className="workbook-total">{total} 个项目</span><div className="workbook-column-control"><button className="button" aria-expanded={settings} onClick={()=>setSettings(!settings)}><Columns3 size={15}/>表格设置</button>{settings&&<div className="workbook-column-menu" aria-label="选择表格列"><strong>显示列</strong>{workbookColumns.map(column=><label key={column.key}><input type="checkbox" checked={columns.includes(column.key)} disabled={column.key==='code'} onChange={()=>toggle(column.key)}/>{column.label}</label>)}</div>}</div></div>
    {(filters||activeFilter)&&<div className="simple-advanced-filters">{advancedFilters}</div>}
    <div className="workbook-scroll" ref={scroll} tabIndex={0} role="region" aria-label="项目节点工作表滚动区">{groups.map(group=><div className="workbook-stage-group" key={group.stage}><h2 style={toneStyle(stageTone(group.stage))}>{group.title}<span>{allGroups.find(item=>item.stage===group.stage)?.projects.length} 个项目</span></h2>{group.projects.map(project=><ProjectSheet key={project.id} project={project} workspace={workspace} columns={columns} today={today} onDetails={onDetails} onChanged={onChanged} onDocuments={()=>onDocuments(project)}/>)}</div>)}{!total&&<div className="simple-project-empty"><Search size={25}/><strong>暂无匹配项目</strong><button className="button" onClick={onReset}>重置筛选与搜索</button></div>}{total>limit&&<div ref={loadMore} className="workbook-load-sentinel" style={{width:sheetWidth}} aria-hidden="true"/>}</div>
  </section>
}
