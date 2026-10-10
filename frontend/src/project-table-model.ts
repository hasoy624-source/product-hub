export const publicProjectFields=['name','stage','progress','completion_time'] as const
export const projectTableFields=['name','priority','stage','progress','planned_progress','description','completion_time','owner','structural_owner','project_kind','category','node','start_date','deadline','deliverable','status'] as const
export const manualProjectFields=['category','owner','node','start_date','deadline','deliverable','priority','status'] as const
export const projectTableStages=['预研','概念与启动','设计与开发','EVT','DVT','PVT','MP']
export const projectTableColumns=[{key:'name',label:'项目编号',width:260},{key:'image',label:'产品示意图',width:120},{key:'category',label:'项目类别',width:125},{key:'owner',label:'负责人',width:130},{key:'node',label:'项目节点',width:190},{key:'start_date',label:'开始日期',width:145},{key:'deadline',label:'截止日期',width:145},{key:'deliverable',label:'输出产物',width:210},{key:'files',label:'相关文件',width:210},{key:'priority',label:'优先级',width:100},{key:'status',label:'节点状态',width:110},{key:'stage',label:'所处阶段',width:115},{key:'progress',label:'项目进度',width:140},{key:'completion_time',label:'完成时间（原表）',width:150}] as const
export type ProjectTableColumn=typeof projectTableColumns[number]['key']
export const defaultProjectTableColumns:ProjectTableColumn[]=['name','image','category','owner','node','start_date','deadline','deliverable','files','priority']
export type ProjectTableField=typeof projectTableFields[number]
export type ProjectTableRow={id:string;name:string;stage:string;progress:number|null;completion_time:string;priority?:string;planned_progress?:number|null;description?:string;owner?:string;structural_owner?:string;project_kind?:string;category?:string;node?:string;start_date?:string;deadline?:string;deliverable?:string;status?:string}
export type ProjectTableData={schema_version:1;revision:string;fields:ProjectTableField[];rows:ProjectTableRow[]}
export type ProjectTableView=ProjectTableData&{storage:'browser'|'server';can_undo:boolean}
export const projectColumnNames:Record<ProjectTableField,string>={name:'项目编号',priority:'优先级',stage:'所处阶段',progress:'项目进度',planned_progress:'计划进度',description:'当前进度说明',completion_time:'完成时间（原表）',owner:'负责人',structural_owner:'结构工程师',project_kind:'所属板块',category:'项目类别',node:'项目节点',start_date:'开始日期',deadline:'截止日期',deliverable:'输出产物',status:'节点状态'}
const stageTones={'预研':'cyan','概念与启动':'cyan','设计与开发':'blue',EVT:'violet',DVT:'amber',PVT:'blue',MP:'rose'} as const
export const projectTableStageTone=(stage:string)=>stageTones[stage as keyof typeof stageTones]||'neutral'
export function validateProjectTable(input:ProjectTableData):ProjectTableData{
  if(!input||input.schema_version!==1||typeof input.revision!=='string'||!input.revision||!Array.isArray(input.fields)||!Array.isArray(input.rows)||input.rows.length>2000)throw new Error('项目表结构不正确')
  if(new Set(input.fields).size!==input.fields.length||!publicProjectFields.every(field=>input.fields.includes(field))||input.fields.some(field=>!projectTableFields.includes(field)))throw new Error('项目表字段不正确')
  const ids=new Set<string>(),names=new Set<string>()
  const rows=input.rows.map(row=>{
    if(typeof row.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(row.id)||ids.has(row.id))throw new Error('项目标识重复或不正确')
    ids.add(row.id);const result:Record<string,unknown>={id:row.id}
    for(const field of input.fields){const value=row[field]
      if(field==='progress'||field==='planned_progress'){if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100))throw new Error('项目进度应为 0–100 或空缺');result[field]=value}
      else {if(typeof value!=='string'||value.length>(field==='description'?10000:field==='name'?200:300)||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw new Error('项目字段格式不正确');result[field]=value.trim()}
    }
    if(!result.name)throw new Error('请填写项目名称');const key=String(result.name).normalize('NFKC').replace(/\s+/g,'').toUpperCase();if(names.has(key))throw new Error('项目名称重复');names.add(key)
    const completion=String(result.completion_time);if(/^\d{4}-\d{2}-\d{2}$/.test(completion)&&new Date(completion+'T00:00:00Z').toISOString().slice(0,10)!==completion)throw new Error('完成日期不正确')
    for(const field of ['start_date','deadline']){const value=result[field];if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(String(value))||new Date(String(value)+'T00:00:00Z').toISOString().slice(0,10)!==value))throw new Error('开始/截止日期格式不正确')}
    if(result.start_date&&result.deadline&&String(result.start_date)>String(result.deadline))throw new Error('开始日期不能晚于截止日期')
    return result as ProjectTableRow
  })
  return {schema_version:1,revision:input.revision,fields:[...input.fields],rows}
}
export function expandedProjectTable(input:ProjectTableData):ProjectTableData{const base=validateProjectTable(input),fields=[...new Set([...base.fields,...manualProjectFields])];return validateProjectTable({...base,fields,rows:base.rows.map(row=>({...Object.fromEntries(manualProjectFields.map(field=>[field,''])),...row}))})}
export function projectStageTabs(rows:ProjectTableRow[]){return ['all',...new Set([...projectTableStages,...rows.map(row=>row.stage).filter(Boolean)]),'unset'].map(id=>({id,label:id==='all'?'全部':id==='unset'?'未设阶段':id,count:rows.filter(row=>id==='all'?true:id==='unset'?!row.stage:row.stage===id).length}))}
export function restoredProjectTableColumns(saved:unknown):ProjectTableColumn[]{return ['name',...new Set((Array.isArray(saved)?saved:defaultProjectTableColumns).filter((key):key is ProjectTableColumn=>typeof key==='string'&&key!=='name'&&projectTableColumns.some(column=>column.key===key)))]}
export function filterProjectTable(rows:ProjectTableRow[],scope:string,query:string){const q=query.trim().toLocaleLowerCase();return rows.filter(row=>(scope==='all'?true:scope==='research'?row.stage==='预研':scope==='unset'?!row.stage:scope==='active'?Boolean(row.stage)&&row.stage!=='预研':scope===row.stage)&&row.name.toLocaleLowerCase().includes(q))}
export function projectTableProgress(value:number|null|undefined){return value==null?'未录入':Number(value.toFixed(2))+'%'}
export function replaceProjectRow(data:ProjectTableData,row:ProjectTableRow){const exists=data.rows.some(item=>item.id===row.id);return validateProjectTable({...data,rows:exists?data.rows.map(item=>item.id===row.id?row:item):[...data.rows,row]})}
