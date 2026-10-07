import type { Project, ProjectMilestone, Workspace } from './types'
import { categoryTone } from './semantics.ts'

export const workbookStages=['概念与启动','设计与开发','EVT','DVT','MP','待确认']
export const workbookStageTitles:Record<string,string>={'概念与启动':'概念与启动阶段（Gate 1）','设计与开发':'设计与开发阶段（Gate 2）','EVT':'工程验证阶段（EVT）','DVT':'设计验证阶段（Gate 3）','MP':'量产阶段（Gate 4）','待确认':'待确认阶段'}
export const workbookColumns=[
  {key:'code',label:'项目编号',width:170},
  {key:'image',label:'产品示意图',width:124},
  {key:'category',label:'项目类别',width:125},
  {key:'owner',label:'负责人',width:132},
  {key:'node',label:'项目节点',width:190},
  {key:'start',label:'开始日期',width:148},
  {key:'deadline',label:'截止日期',width:148},
  {key:'deliverable',label:'输出产物',width:220},
  {key:'documents',label:'相关文件',width:220},
  {key:'priority',label:'优先级',width:112},
  {key:'status',label:'节点状态',width:124},
] as const
export type WorkbookColumn=typeof workbookColumns[number]['key']
export const defaultWorkbookColumns:WorkbookColumn[]=['code','image','category','owner','node','start','deadline','deliverable','documents','priority']
export function restoredWorkbookColumns(saved:unknown):WorkbookColumn[] {
  const values=Array.isArray(saved)?[...saved,'start']:saved&&typeof saved==='object'&&'version' in saved&&saved.version===2&&'columns' in saved&&Array.isArray(saved.columns)?saved.columns:defaultWorkbookColumns
  const known=new Set<string>(workbookColumns.map(column=>column.key))
  return ['code',...new Set(values.filter((key):key is WorkbookColumn=>typeof key==='string'&&key!=='code'&&known.has(key)))]
}
export const workbookPageSize=8
export function nextWorkbookLimit(current:number,total:number) { return Math.min(current+workbookPageSize,total) }
export function projectWorkbookGroups(projects:Project[],stage='all') {
  const visible=projects.filter(project=>stage==='all'||project.stage===stage)
  const stages=[...new Set(visible.map(project=>project.stage))]
  return stages.map(value=>({stage:value,title:workbookStageTitles[value]||value,projects:visible.filter(project=>project.stage===value)})).filter(group=>group.projects.length>0)
}
export function workbookCategory(workspace:Workspace,projectId:string) {
  const id=workspace.entity_meta.find(row=>row.scope==='project'&&row.entity_id===projectId)?.category_id
  return workspace.categories.find(row=>row.id===id)?.name||'未分类'
}
export function workbookNodeTone(node:ProjectMilestone) { return categoryTone(node.name) }
export function linkedNodeDocuments(workspace:Workspace,projectId:string,node:ProjectMilestone) {
  const ids=new Set(node.document_ids||[])
  return workspace.knowledge_documents.filter(document=>document.project_id===projectId&&ids.has(document.id))
}
