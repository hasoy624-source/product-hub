import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, ImagePlus, Pencil, Plus, X } from 'lucide-react'
import { api, uploadProjectImage } from './api'
import SemanticTag from './SemanticTag'
import RecordMetaEditor from './RecordMetaEditor'
import { projectProgressText } from './classification'
import { stageTone, statusTone, toneStyle } from './semantics'
import { emptyMilestone, emptyProfile, validateMilestone, displayProjectText } from './project-native'
import type { Project, ProjectDetails, ProjectMilestone, ProjectUpdate, Task, Workspace } from './types'

const stages = ['概念与启动', '设计与开发', 'EVT', 'DVT', 'MP']
const tabs = ['概况', '节点计划', '问题与任务', '项目动态'] as const
type Tab = typeof tabs[number]
type RecordEdit = { kind: 'milestones' | 'updates'; id?: string; values: Record<string, string | number> }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())

function RecordDialog({ edit, onClose, onSave }: { edit: RecordEdit; onClose: () => void; onSave: (values: Record<string, string | number>) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState(edit.values)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close() }, [])
  const field = (key: string, label: string, type = 'text', options?: string[]) => <div className={`field ${type === 'textarea' ? 'full' : ''}`} key={key}><label htmlFor={`native-${key}`}>{label}</label>{options ? <select id={`native-${key}`} value={String(values[key] ?? '')} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}>{options.map(option => <option key={option}>{option}</option>)}</select> : type === 'textarea' ? <textarea id={`native-${key}`} rows={key === 'content' ? 9 : 4} required={key === 'content'} maxLength={key === 'content' ? 100000 : 20000} value={String(values[key] ?? '')} onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}/> : <input id={`native-${key}`} type={type} maxLength={key === 'name' ? 200 : 100} required={key === 'name'} min={type === 'number' ? 0 : undefined} max={type === 'number' ? 10000 : undefined} value={String(values[key] ?? '')} onInput={type === 'date' ? e => { const value = e.currentTarget.value; setValues(v => ({ ...v, [key]: value })) } : undefined} onChange={e => setValues(v => ({ ...v, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}/>}</div>
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      if (edit.kind === 'milestones') validateMilestone(values as ReturnType<typeof emptyMilestone>)
      await onSave(values)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') } finally { setBusy(false) }
  }
  return <dialog ref={dialog} className="editor native-record-dialog" aria-labelledby="native-dialog-title" onCancel={e => { if (busy) e.preventDefault(); else onClose() }}><form onSubmit={submit}><div className="dialog-head"><h2 id="native-dialog-title">{edit.id ? '编辑' : '新增'}{edit.kind === 'milestones' ? '节点' : '动态'}</h2><button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label="关闭记录弹窗"><X size={20}/></button></div><div className="form-body">{edit.kind === 'milestones' ? <>{field('name', '节点名称')}{field('owner', '节点负责人')}{field('status', '节点状态', 'text', ['待开始', '进行中', '已完成', '暂停', '待确认'])}{field('sort_order', '排序', 'number')}{field('planned_start', '计划开始', 'date')}{field('planned_end', '计划结束', 'date')}{field('actual_start', '实际开始', 'date')}{field('actual_end', '实际结束', 'date')}{field('recorded_text', '节点记录', 'textarea')}{field('note', '备注与措施', 'textarea')}</> : <>{field('kind', '动态类型', 'text', ['进度记录', '历史进度', '关键节点', '历史问题', '风险记录', '待确认', '操作记录'])}{field('occurred_on', '发生日期', 'date')}{field('author', '记录人')}{field('content', '动态内容', 'textarea')}</>}</div>{error && <p className="form-error editor-error" role="alert">{error}</p>}<div className="dialog-footer"><button type="button" className="button" onClick={onClose} disabled={busy}>取消</button><button className="button primary" disabled={busy}>{busy ? '正在保存…' : '保存记录'}</button></div></form></dialog>
}

function TextSection({ title, children, tone }: { title: string; children: ReactNode; tone?: string }) {
  const [expanded, setExpanded] = useState(false)
  const text = typeof children === 'string' ? displayProjectText(children) : ''
  const lines = text.split('\n')
  const long = lines.length > 6 || text.length > 600
  return <section className={`native-text-section ${tone || ''}`}><h3>{title}</h3><div className={`native-prose ${long && !expanded ? 'native-prose-clamped' : ''}`}>{text || children || <span className="muted">未填写</span>}</div>{long && <button className="text-button native-expand-text" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? '收起内容' : '展开全部'}</button>}</section>
}

export default function ProjectWorkspace({ project, tasks, workspace, onBack, onChanged, onEditProject, onEditTask, onAddTask, onDocuments, onManage }: { project: Project; tasks: Task[]; workspace: Workspace; onBack: () => void; onChanged: () => Promise<void>; onEditProject: () => void; onEditTask: (task: Task) => void; onAddTask: () => void; onDocuments: () => void; onManage: () => void }) {
  const [tab, setTab] = useState<Tab>('概况')
  const [data, setData] = useState<ProjectDetails | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<RecordEdit | null>(null)
  const [page, setPage] = useState(0)
  const [updateFilter, setUpdateFilter] = useState('全部动态')
  const imageInput = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([])
  useEffect(() => { panel.current?.scrollTo({ top: 0 }) }, [tab])
  const loadDetails = useCallback(async () => {
    const result = await api<ProjectDetails>(`/projects/${project.id}/details`)
    setData(result)
  }, [project.id])
  useEffect(() => {
    let active = true
    setError('')
    api<ProjectDetails>(`/projects/${project.id}/details`).then(value => { if (active) setData(value) }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '项目读取失败') })
    return () => { active = false }
  }, [project])
  const profile = project.profile || data?.profile || emptyProfile()
  const openTasks = tasks.filter(task => task.status !== '已完成')
  const milestones = data?.milestones || []
  const updates = (data?.updates || []).filter(item => updateFilter === '全部动态' || item.kind === updateFilter)
  const shownUpdates = updates.slice(page * 10, page * 10 + 10)
  async function change(work: () => Promise<unknown>) {
    setBusy(true); setError('')
    try { await work(); await Promise.all([loadDetails(), onChanged()]) } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') } finally { setBusy(false) }
  }
  function openRecord(kind: RecordEdit['kind'], row?: ProjectMilestone | ProjectUpdate) {
    const values = row ? { ...row } : kind === 'milestones' ? { ...emptyMilestone(), owner: project.owner, sort_order: Math.min(10000, Math.max(0, ...milestones.map(item => item.sort_order)) + 10) } : { content: '', author: project.owner, kind: '进度记录', occurred_on: today() }
    const body = { ...values } as Record<string, string | number>
    delete body.id; delete body.project_id; delete body.created_at
    setEdit({ kind, id: row?.id, values: body })
  }
  const taskRows = (items: Task[]) => <div className="native-task-list">{items.map(task => <article className="native-task" key={task.id}><div className="native-task-head"><SemanticTag kind="status" value={task.status}/><h3 className={task.status === '已完成' ? 'strike' : ''}>{task.title}</h3><button className="icon-button" onClick={() => onEditTask(task)} aria-label={`编辑任务 ${task.title}`}><Pencil size={15}/></button></div>{task.description && <details className="native-task-content"><summary>问题与处理措施</summary><div className="native-prose">{displayProjectText(task.description)}</div></details>}<div className="native-task-foot"><span>{task.owner || '待指定'} · 截止 {task.due_date || '未设置'}{task.due_date && task.due_date < today() && task.status !== '已完成' && <b className="overdue"> · 已逾期</b>}</span><select className="status-select semantic-control" style={toneStyle(statusTone(task.status))} aria-label={`${task.title}状态`} value={task.status} disabled={busy} onChange={e => void change(() => api(`/tasks/${task.id}`, 'PATCH', { status: e.target.value }))}>{['待办', '进行中', '已完成'].map(value => <option key={value}>{value}</option>)}</select></div></article>)}</div>
  return <section className="project-detail native-project" data-tone={stageTone(project.stage)} style={toneStyle(stageTone(project.stage))} aria-label={`${project.name} 项目工作区`}>
    <header className="native-project-header"><button className="text-button project-mobile-back" onClick={onBack}><ArrowLeft size={16}/>返回项目列表</button><div className="native-project-identity"><h2>{project.name}</h2><div className="native-eyebrow"><SemanticTag kind="stage" value={project.stage}/>{profile.phase && <span>{profile.phase}</span>}<SemanticTag kind="status" value={project.status}/></div></div><div className="inline-actions"><button className="button" onClick={onDocuments}><BookOpen size={15}/>阶段文档</button><button className="button" onClick={onEditProject}><Pencil size={15}/>编辑项目</button></div></header>
    <div className="native-summary"><div><span>负责人</span><strong>{project.owner || '待指定'}</strong></div><div><span>计划完成</span><strong>{project.due_date || '未确定'}</strong></div><div><span>优先级</span><strong className={/S\+|紧急/.test(profile.priority) ? 'priority-urgent' : ''}>{profile.priority || '未设置'}</strong></div><div><span>完成进度</span><strong>{projectProgressText(project)}</strong></div></div>
    <div className="native-tabs" role="tablist" aria-label="项目内容">{tabs.map((value, index) => <button ref={element => { tabButtons.current[index] = element }} role="tab" id={`project-tab-${index}`} aria-controls={`project-panel-${index}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; setTab(tabs[next]); tabButtons.current[next]?.focus({ preventScroll: true }) } }}>{value}{value === '问题与任务' && openTasks.length > 0 && <span>{openTasks.length}</span>}</button>)}</div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!data && !error && <div className="empty">正在读取项目…</div>}
    {data && <div ref={panel} className="native-panel" role="tabpanel" tabIndex={0} id={`project-panel-${tabs.indexOf(tab)}`} aria-labelledby={`project-tab-${tabs.indexOf(tab)}`}>
      {tab === '概况' && <div className="native-overview-layout"><div className="native-overview-main">
        <section className="native-focus-work"><div className="native-section-heading"><h3>待推进 <span>{openTasks.length}</span></h3><button className="text-button" onClick={onAddTask}><Plus size={14}/>添加任务</button></div>{openTasks.length ? <><div className="native-next-tasks">{openTasks.slice(0, 3).map(task => <button key={task.id} onClick={() => setTab('问题与任务')}><SemanticTag kind="status" value={task.status}/><span><strong>{task.title}</strong><small>{task.owner || '待指定'}{task.due_date && ` · ${task.due_date}`}</small></span><ChevronRight size={16}/></button>)}</div><button className="text-button native-all-tasks" onClick={() => setTab('问题与任务')}>查看全部任务<ChevronRight size={14}/></button></> : <div className="native-empty">暂无待处理任务</div>}</section>
        {profile.risk_note && <TextSection title="风险与卡点" tone="native-risk">{profile.risk_note}</TextSection>}
        {profile.key_plan ? <TextSection title="关键节点与交付">{profile.key_plan}</TextSection> : <section className="native-text-section"><div className="native-section-heading"><h3>节点计划</h3><button className="text-button" onClick={() => setTab('节点计划')}>管理节点<ChevronRight size={14}/></button></div><div className="native-empty">{milestones.length ? `${milestones.length} 个节点` : '暂无节点计划'}</div></section>}
        {profile.target && <TextSection title="项目目标">{profile.target}</TextSection>}{project.description && <TextSection title="项目说明">{project.description}</TextSection>}
        {!profile.target && <button className="text-button native-fill-target" onClick={onEditProject}><Pencil size={13}/>补充项目目标</button>}
      </div><aside className="native-overview-aside" aria-label="项目资料">
        <section className="native-team"><h3>项目团队</h3><dl><div><dt>项目负责人</dt><dd>{project.owner || '待指定'}</dd></div><div><dt>结构工程师</dt><dd>{profile.structural_owner || '待指定'}</dd></div>{profile.actual_completed_on && <div><dt>实际完成</dt><dd>{profile.actual_completed_on}</dd></div>}</dl></section>
        <section className="native-product-images"><div className="native-section-heading"><h3>产品示意图</h3><button className="icon-button" disabled={busy} onClick={() => imageInput.current?.click()} aria-label="添加产品示意图"><ImagePlus size={17}/></button></div><input hidden ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void change(() => uploadProjectImage(project.id, file)) }}/>{data.images.length ? <div className="native-image-grid">{data.images.map((image, index) => <a key={image.id} href={image.url || `/api/project-assets/${image.filename}`} target="_blank" rel="noreferrer" aria-label={`查看 ${project.name} 示意图 ${index + 1}`}><img src={image.url || `/api/project-assets/${image.filename}`} alt={`${project.name} ${image.caption || '产品示意图'} ${index + 1}`} loading="lazy"/></a>)}</div> : <button className="native-image-empty" disabled={busy} onClick={() => imageInput.current?.click()}><ImagePlus size={22}/>添加示意图</button>}</section>
        <details className="native-workflow"><summary>研发流程</summary><ol>{stages.map((stage, index) => <li key={stage} aria-current={stage === project.stage ? 'step' : undefined}><span>{index + 1}</span><SemanticTag kind="stage" value={stage}/>{stage === project.stage && <small>当前</small>}</li>)}</ol></details>
        <RecordMetaEditor scope="project" entityId={project.id} categories={workspace.categories || []} fields={workspace.custom_fields || []} meta={workspace.entity_meta?.find(item => item.scope === 'project' && item.entity_id === project.id)} onChanged={onChanged} onManage={onManage}/>
      </aside></div>}
      {tab === '节点计划' && <><div className="native-section-heading"><h3>节点计划 <span>{milestones.length}</span></h3><div className="inline-actions"><button className="text-button" disabled={busy} onClick={() => void change(() => api(`/projects/${project.id}/milestone-template`, 'POST', {}))}>补充研发节点</button><button className="button" disabled={busy} onClick={() => openRecord('milestones')}><Plus size={15}/>添加节点</button></div></div>{milestones.length ? <div className="native-milestone-scroll"><table className="data-table native-milestone-table"><thead><tr><th>节点 / 负责人</th><th>计划时间</th><th>实际时间</th><th>状态</th><th>节点记录 / 备注</th><th>操作</th></tr></thead><tbody>{milestones.map(node => <tr key={node.id}><td><strong>{node.name}</strong><small>{node.owner || '待指定'}</small></td><td><span>{node.planned_start || '—'}</span><small>至 {node.planned_end || '—'}</small></td><td><span>{node.actual_start || '—'}</span><small>至 {node.actual_end || '—'}</small></td><td><SemanticTag kind="status" value={node.status}/></td><td>{node.recorded_text || node.note ? <details><summary><span className="native-node-summary">{displayProjectText(node.recorded_text || node.note).split("\n")[0]}</span><span>展开记录</span></summary><div className="native-prose">{displayProjectText([node.recorded_text, node.note].filter(Boolean).join('\n\n'))}</div></details> : '—'}</td><td><button className="icon-button" aria-label={`编辑节点 ${node.name}`} onClick={() => openRecord('milestones', node)}><Pencil size={15}/></button></td></tr>)}</tbody></table></div> : <div className="native-empty">暂无节点计划</div>}</>}
      {tab === '问题与任务' && <><div className="native-section-heading"><h3>问题与任务 <span>{tasks.filter(t => t.status === '已完成').length} / {tasks.length} 已完成</span></h3><button className="button" onClick={onAddTask}><Plus size={15}/>添加任务</button></div>{tasks.length ? taskRows([...openTasks, ...tasks.filter(t => t.status === '已完成')]) : <div className="native-empty">暂无项目任务</div>}</>}
      {tab === '项目动态' && <><div className="native-section-heading"><h3>项目动态 <span>{updates.length}</span></h3><button className="button" onClick={() => openRecord('updates')}><Plus size={15}/>记录进展</button></div><div className="native-update-filter"><label htmlFor="native-update-filter">动态类型</label><select id="native-update-filter" value={updateFilter} onChange={event => { setUpdateFilter(event.target.value); setPage(0) }}>{['全部动态', '进度记录', '历史进度', '关键节点', '历史问题', '风险记录', '待确认', '操作记录'].map(value => <option key={value}>{value}</option>)}</select></div>{shownUpdates.length ? <ol className="native-timeline">{shownUpdates.map(update => <li key={update.id}><div className="native-update-head"><span className={`native-update-kind ${update.kind === '风险记录' ? 'risk' : ''}`}>{update.kind}</span><time>{update.occurred_on || '时间未标注'}</time>{update.author && <span>{update.author}</span>}<button className="icon-button" onClick={() => openRecord('updates', update)} aria-label="编辑项目动态"><Pencil size={14}/></button></div><div className="native-prose">{displayProjectText(update.content)}</div></li>)}</ol> : <div className="native-empty">暂无项目动态</div>}{updates.length > 10 && <div className="native-pagination"><button className="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}><ChevronLeft size={15}/>上一页</button><span>{page + 1} / {Math.ceil(updates.length / 10)}</span><button className="button" disabled={(page + 1) * 10 >= updates.length} onClick={() => setPage(value => value + 1)}>下一页<ChevronRight size={15}/></button></div>}</>}
    </div>}
    {edit && <RecordDialog edit={edit} onClose={() => setEdit(null)} onSave={async values => { await api(`/projects/${project.id}/${edit.kind}${edit.id ? `/${edit.id}` : ''}`, edit.id ? 'PATCH' : 'POST', values); setEdit(null); await Promise.all([loadDetails(), onChanged()]) }}/>}</section>
}
