import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Activity, ArrowRight, BarChart3, BookOpen, Boxes, CalendarDays, Check, CircleHelp, ChevronLeft, ChevronRight, Download, FileText, FlaskConical, Layers3, LayoutDashboard, LogOut, Menu, Pencil, Play, Plus, Radar, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react'
import { api, ApiError, publishedPreviewEnabled } from './api'
import ClassificationSettings from './ClassificationSettings'
import MarketIntelligence from './MarketIntelligence'
import './market.css'
import ExceptionCenter from './ExceptionCenter'
import OperationalOverview from './OperationalOverview'
import UsageGuide from './UsageGuide'
import { guideHrefFor, isGuideRoute } from './guide-catalog'
import SemanticTag from './SemanticTag'
import { categoryTone, fieldTone, toneStyle } from './semantics'
import KnowledgeBase from './KnowledgeBase'
import ProjectBoard from './ProjectBoard'
import ProjectWorkspace from './ProjectWorkspace'
import ProjectWorkbook from './ProjectWorkbook'
import Brand, { applicationName } from './Brand'
import { projectRoute,projectSheetHref } from './project-links'
import './project-workbook.css'
import ProjectDetailsDrawer from './ProjectDetailsDrawer'
import './project-simple.css'
import { projectBody, projectProfileKeys } from './project-native'
import ProductBoard from './ProductBoard'
import RecordMetaEditor from './RecordMetaEditor'
import { filterProducts, filterProjects, filterSalesByProducts, searchProjects, reportCategoryId } from './classification'
import type { Stage } from './knowledge-catalog'
import { yuanToCents } from './money'
import type { Dashboard, EditState, Entity, Field, Job, Product, Project, Report, Sale, Seat, Signal, Task, Workspace } from './types'

const stages = ['概念与启动', '设计与开发', 'EVT', 'DVT', 'MP']
const routeItems = [
  { id: 'overview', title: '工作台总览', short: '总览', icon: LayoutDashboard },
  { id: 'exceptions', title: '异常中心', short: '异常', icon: Activity },
  { id: 'products', title: '产品与销售', short: '产品', icon: Boxes },
  { id: 'projects', title: '研发项目', short: '研发', icon: FlaskConical },
  { id: 'knowledge', title: '流程知识库', short: '知识库', icon: BookOpen },
  { id: 'signals', title: '市场情报', short: '情报', icon: Radar },
  { id: 'reports', title: '报告与任务', short: '报告', icon: FileText },
  { id: 'integrations', title: '集成席位', short: '集成', icon: Layers3 },
  { id: 'settings', title: '分类与字段', short: '配置', icon: Settings2 },
  { id: 'guide', title: '使用说明', short: '说明', icon: CircleHelp },
]
const navigationGroups = [
  { title: '监测', ids: ['overview', 'exceptions'] },
  { title: '业务推进', ids: ['projects', 'products', 'signals'] },
  { title: '资料与设置', ids: ['knowledge', 'reports', 'integrations', 'settings'] },
]
const staticPreview = import.meta.env.VITE_PREVIEW_MODE === 'true'
const money = (cents: number, precise = false) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', minimumFractionDigits: precise ? 2 : 0, maximumFractionDigits: precise ? 2 : 0 }).format(cents / 100)
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const dateText = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '尚未执行'
const options = (values: string[]) => values.map(value => ({ label: value, value }))
const routeFromHash = () => {
  const route = location.hash.slice(1).split('?',1)[0]
  return routeItems.some(item => item.id === route) || /^exceptions\/(tasks|projects|signals)$/.test(route) || isGuideRoute(route) ? route : 'overview'
}

function Badge({ children }: { children: ReactNode }) {
  return <SemanticTag kind="status" value={String(children)}/>
}
function Empty({ children = '暂无记录' }: { children?: ReactNode }) { return <div className="empty"><Layers3 size={26} /><p>{children}</p></div> }
function SectionHeading({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) { return <div className="section-heading"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{action}</div> }
function DownloadButton({ report }: { report: Report }) { return <button className="icon-button" title="下载 Markdown" aria-label={`下载 ${report.title}`} onClick={() => { const url = URL.createObjectURL(new Blob([report.content], { type: 'text/markdown;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `${report.title.replace(/[\\/:*?"<>|]/g, '-')}.md`; link.click(); URL.revokeObjectURL(url) }}><Download size={17} /></button> }

function Editor({ edit, onClose, onSave }: { edit: EditState; onClose: () => void; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState(edit.values)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close() }, [])
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try {
      const body: Record<string, unknown> = { ...values }
      for (const field of edit.fields) {
        if (field.required && !String(values[field.key] ?? '').trim()) throw new Error(`请填写${field.label}`)
        if (field.type === 'number') {
          if (edit.entity === 'projects' && field.key === 'progress' && values.progress === '') delete body.progress
          else body[field.key] = Number(values[field.key] || 0)
        }
      }
      if (edit.entity === 'sales') { body.revenue_cents = yuanToCents(String(values.revenue_yuan || '0')); delete body.revenue_yuan }
      if (edit.entity === 'jobs' && values.next_run_at) body.next_run_at = new Date(String(values.next_run_at)).toISOString()
      await onSave(edit.entity === 'projects' ? projectBody(body) : body)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请重试') } finally { setBusy(false) }
  }
  const primary: Record<Entity, string[]> = {
    products: ['name', 'sku', 'category', 'owner'],
    sales: ['product_id', 'month', 'revenue_yuan', 'units'],
    projects: ['name', 'stage', 'start_date', 'due_date'],
    tasks: ['project_id', 'title', 'owner', 'due_date', 'description'],
    signals: ['kind', 'brand', 'title', 'content', 'occurred_on'],
    seats: ['name', 'kind', 'provider'],
    jobs: ['name', 'frequency', 'next_run_at'],
  }
  const basicFields = edit.fields.filter(field => primary[edit.entity].includes(field.key))
  const extraFields = edit.fields.filter(field => !primary[edit.entity].includes(field.key))
  const renderField = (field: Field) => <div key={field.key} className={`field ${field.type === 'textarea' ? 'full' : ''}`}>
    <label htmlFor={`field-${field.key}`}>{field.label}{field.required && <span className="required"> *</span>}</label>
    {field.type === 'checkbox' ? <label className="checkbox-label"><input id={`field-${field.key}`} type="checkbox" checked={Boolean(values[field.key])} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.checked }))}/>启用自动生成</label>
      : field.options ? <select className={['stage', 'status', 'sentiment', 'category', 'kind'].includes(field.key) ? 'semantic-control' : undefined} style={toneStyle(fieldTone(field.key, String(values[field.key] ?? '')))} id={`field-${field.key}`} required={field.required} value={String(values[field.key] ?? '')} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      : field.type === 'textarea' ? <textarea id={`field-${field.key}`} rows={3} required={field.required} value={String(values[field.key] ?? '')} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}/>
      : <input id={`field-${field.key}`} type={field.type || 'text'} min={field.min} max={field.max} step={field.step || (field.type === 'number' ? '1' : undefined)} required={field.required} value={String(values[field.key] ?? '')} onInput={field.type === 'date' ? event => { const value = event.currentTarget.value; setValues(current => ({ ...current, [field.key]: value })) } : undefined} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}/>}
    {field.hint && <small>{field.hint}</small>}
  </div>
  return <dialog ref={dialog} className="editor" onCancel={event => { if (busy) event.preventDefault(); else onClose() }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }} aria-labelledby="editor-title"><form onSubmit={submit}>
    <div className="dialog-head"><div><h2 id="editor-title">{edit.title}</h2></div><button type="button" className="icon-button" aria-label="关闭弹窗" onClick={onClose} disabled={busy}><X size={20}/></button></div>
    <div className="form-body">{basicFields.map(renderField)}</div>
    {extraFields.length > 0 && <details className="editor-more"><summary>更多信息 <span>{extraFields.length} 项</span></summary><div className="form-body editor-extra-fields">{extraFields.map(renderField)}</div></details>}
    {error && <p className="form-error editor-error" role="alert">{error}</p>}
    <div className="dialog-footer"><button className="button" type="button" disabled={busy} onClick={onClose}>取消</button><button className="button primary" disabled={busy}>{busy ? '正在保存…' : '保存记录'}</button></div>
  </form></dialog>
}

function ReportPreview({ report, onClose, workspace, onChanged, onManage }: { report: Report; onClose: () => void; workspace: Workspace; onChanged: () => Promise<void>; onManage: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="report-dialog" aria-labelledby="report-title" onCancel={onClose}><div className="dialog-head"><div><h2 id="report-title">{report.title}</h2></div><div className="inline-actions"><DownloadButton report={report}/><button className="icon-button" onClick={onClose} aria-label="关闭报告"><X size={20}/></button></div></div><RecordMetaEditor scope="report" entityId={report.id} categories={workspace.categories || []} fields={workspace.custom_fields || []} meta={workspace.entity_meta?.find(item => item.scope === 'report' && item.entity_id === report.id)} onChanged={onChanged} onManage={onManage}/><pre>{report.content}</pre></dialog>
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash)
  const [month, setMonth] = useState(localDate().slice(0, 7))
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [mode, setMode] = useState('demo')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [auth, setAuth] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [edit, setEdit] = useState<EditState | null>(null)
  const [report, setReport] = useState<Report | null>(null)
  const [toast, setToast] = useState('')
  const [busyKey, setBusyKey] = useState('')
  const [query, setQuery] = useState('')
  const [productFilter, setProductFilter] = useState('all')
  const [projectDetailOpen, setProjectDetailOpen] = useState(false)
  const [projectStageFilter, setProjectStageFilter] = useState('all')
  const [selectedProject, setSelectedProject] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [projectTableTarget,setProjectTableTarget]=useState('')
  const [reportFilter, setReportFilter] = useState('all')
  const [knowledgeContext, setKnowledgeContext] = useState<{ stage: Stage; projectId: string } | null>(null)
  const requestId = useRef(0)
  const reload = useCallback(async () => {
    const id = ++requestId.current; setLoading(true); setError('')
    try {
      const [data, summary, health] = await Promise.all([api<Workspace>('/workspace'), api<Dashboard>(`/dashboard?month=${month}`), api<{ mode: string; workspace_kind?: string }>('/health')])
      if (id !== requestId.current) return
      setWorkspace(data); setDashboard(summary); setMode(health.workspace_kind === 'project-register' ? 'projects' : health.mode); setAuth(false)
    } catch (e) { if (id !== requestId.current) return; if (e instanceof ApiError && e.status === 401) setAuth(true); else setError(e instanceof Error ? e.message : '连接失败，请重试') }
    finally { if (id === requestId.current) setLoading(false) }
  }, [month])
  useEffect(() => { void reload() }, [reload])
  useEffect(() => { const handler = () => { setRoute(routeFromHash()); setQuery(''); setMenuOpen(false); const target=projectRoute(location.hash); if(target){if(location.hash.includes('?')){setProjectFilter(target.filter);setProjectStageFilter('all');setProjectDetailOpen(false)}setProjectTableTarget(target.projectId)}else setProjectTableTarget('') }; handler();window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler) }, [])
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }) }, [route])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer) }, [toast])
  const navigate = (to: string) => { location.hash = to; setMenuOpen(false) }
  const productName = (id: string) => workspace?.products.find(p => p.id === id)?.name || '未关联产品'
  function shiftMonth(offset: number) { const [y, m] = month.split('-').map(Number); setMonth(localDate(new Date(y, m - 1 + offset, 1)).slice(0, 7)) }
  function openEditor(entity: Entity, item?: Product | Sale | Project | Task | Signal | Seat | Job, preset: Record<string, string> = {}) {
    if (!workspace) return
    const text = (key: string, label: string, required = true): Field => ({ key, label, required })
    const select = (key: string, label: string, values: string[]): Field => ({ key, label, options: options(values), required: true })
    const productOptions = [{ label: '请选择产品', value: '' }, ...workspace.products.map(p => ({ label: p.name, value: p.id }))]
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    const definitions: Record<Entity, { title: string; values: Record<string, string | number | boolean>; fields: Field[] }> = {
      products: { title: '产品', values: { name: '', sku: '', category: productFilter === 'all' ? '配件类' : productFilter, status: '在售', owner: '', description: '' }, fields: [text('name', '产品名称'), text('sku', 'SKU'), text('category', '产品类别'), select('status', '产品状态', ['在售', '研发中', '已下架']), text('owner', '负责人'), { key: 'description', label: '产品说明', type: 'textarea' }] },
      sales: { title: '月度销售', values: { product_id: workspace.products.find(p => productFilter === 'all' || p.category === productFilter)?.id || workspace.products[0]?.id || '', month, revenue_yuan: '', units: 0, channel: '独立站', note: '' }, fields: [{ key: 'product_id', label: '产品', options: productOptions, required: true }, { key: 'month', label: '销售月份', type: 'month', required: true }, { key: 'revenue_yuan', label: '人民币净销售额（元）', type: 'number', min: 0, step: '0.01', required: true }, { key: 'units', label: '销售数量（件）', type: 'number', min: 0, required: true }, text('channel', '销售渠道'), { key: 'note', label: '备注', type: 'textarea' }] },
      projects: { title: '研发项目', values: { name: '', product_id: '', stage: stages[0], status: '正常', owner: '', start_date: '', due_date: '', progress: '', description: '', priority: '', phase: '', structural_owner: '', target: '', key_plan: '', risk_note: '', actual_completed_on: '' }, fields: [text('name', '项目名称'), { key: 'product_id', label: '关联产品', options: [{ label: '不关联产品', value: '' }, ...productOptions.slice(1)] }, select('stage', '当前阶段', [...stages, '待确认']), select('status', '项目状态', ['正常', '风险', '暂停', '已完成', '待立项', '已终止', '待确认']), text('phase', '当前工作阶段', false), text('priority', '优先级', false), text('owner', '项目负责人', false), text('structural_owner', '结构工程师', false), { key: 'target', label: '项目目标', type: 'textarea' }, { key: 'key_plan', label: '关键节点与交付', type: 'textarea' }, { key: 'risk_note', label: '风险与卡点', type: 'textarea' }, { key: 'actual_completed_on', label: '实际完成日期', type: 'date' }, { key: 'start_date', label: '开始日期', type: 'date' }, { key: 'due_date', label: '截止日期', type: 'date' }, { key: 'progress', label: '项目进度（%）', type: 'number', min: 0, max: 100 }, { key: 'description', label: '项目说明 / 阶段记录', type: 'textarea' }] },
      tasks: { title: '项目任务', values: { project_id: selectedProject || workspace.projects[0]?.id || '', title: '', owner: '', due_date: '', status: '待办', description: '' }, fields: [{ key: 'project_id', label: '所属项目', options: [{ label: '请选择项目', value: '' }, ...workspace.projects.map(p => ({ label: p.name, value: p.id }))], required: true }, text('title', '任务名称'), text('owner', '负责人', false), { key: 'due_date', label: '截止日期', type: 'date' }, select('status', '任务状态', ['待办', '进行中', '已完成']), { key: 'description', label: '问题与处理措施', type: 'textarea' }] },
      signals: { title: '市场情报', values: { kind: '市场反馈', brand: '', title: '', content: '', sentiment: '中性', source_url: '', occurred_on: localDate() }, fields: [select('kind', '情报类型', ['竞品动态', '市场反馈', '独立站评价']), text('brand', '品牌 / 产品'), text('title', '标题'), select('sentiment', '反馈倾向', ['正向', '中性', '负向']), { key: 'occurred_on', label: '发生日期', type: 'date', required: true }, { key: 'source_url', label: '来源链接', type: 'url' }, { key: 'content', label: '情报内容', type: 'textarea', required: true }] },
      seats: { title: '集成席位', values: { name: '', kind: 'AI 总结', provider: '', status: '待接入', note: '' }, fields: [text('name', '席位名称'), select('kind', '集成类型', ['AI 总结', '销售数据', '评价采集']), text('provider', '服务提供方'), select('status', '配置状态', ['待接入', '已停用']), { key: 'note', label: '集成说明', type: 'textarea', hint: '仅记录接入计划；此处不要填写 API Key 或其他凭据。' }] },
      jobs: { title: '定时报告任务', values: { name: '', frequency: 'monthly', enabled: true, next_run_at: `${localDate(tomorrow)}T09:00` }, fields: [text('name', '任务名称'), { key: 'frequency', label: '运行频率', options: [{ label: '每天', value: 'daily' }, { label: '每周', value: 'weekly' }, { label: '每月', value: 'monthly' }], required: true }, { key: 'next_run_at', label: '下一次运行（本地时间）', type: 'datetime-local', required: true }, { key: 'enabled', label: '自动运行', type: 'checkbox' }] },
    }
    const definition = definitions[entity]
    const values = { ...definition.values, ...(item || {}), ...preset } as Record<string, string | number | boolean>
    delete values.id
    delete values.import_info
    delete values.profile
    if (entity === 'projects') {
      const project = item as Project | undefined
      for (const key of projectProfileKeys) values[key] = project?.profile?.[key] || ''
      if (project?.profile?.progress_known === false || project?.import_info?.progress_known === false) values.progress = ''
    }
    if (entity === 'sales' && item) { values.revenue_yuan = ((item as Sale).revenue_cents / 100).toFixed(2); delete values.revenue_cents }
    if (entity === 'jobs' && item) { const date = new Date((item as Job).next_run_at); values.next_run_at = `${localDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; delete values.last_run_at }
    setEdit({ entity, id: item?.id, title: `${item ? '编辑' : '新建'}${definition.title}`, fields: definition.fields, values })
  }
  async function save(body: Record<string, unknown>) {
    if (!edit) return
    try {
      const saved = await api<{ id: string }>(`/${edit.entity}${edit.id ? `/${edit.id}` : ''}`, edit.id ? 'PATCH' : 'POST', body)
      if (edit.entity === 'projects' && !edit.id) { setSelectedProject(saved.id); setProjectDetailOpen(false); setProjectStageFilter('all'); setProjectFilter('all'); setQuery(''); navigate('projects') }
      setEdit(null); setToast('记录已保存'); await reload()
    }
    catch (e) { if (e instanceof ApiError && e.status === 401) { setEdit(null); setAuth(true) }; throw e }
  }
  async function action(key: string, callback: () => Promise<unknown>, success: string) {
    setBusyKey(key); setError('')
    try { await callback(); setToast(success); await reload() } catch (e) { if (e instanceof ApiError && e.status === 401) setAuth(true); else setError(e instanceof Error ? e.message : '操作失败') } finally { setBusyKey('') }
  }
  async function generate() { await action('generate', async () => { const result = await api<Report>('/reports/generate', 'POST', { month }); setReport(result) }, '月度报告已生成') }
  async function login(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoginBusy(true); setLoginError(''); const form = new FormData(event.currentTarget); try { await api('/auth/login', 'POST', { username: form.get('username'), password: form.get('password') }); await reload() } catch (e) { setLoginError(e instanceof Error ? e.message : '登录失败') } finally { setLoginBusy(false) } }

  if (auth) return <main className="login-page"><div className="login-brand"><Brand variant="login"/></div><form className="login-form" onSubmit={login}><h1>登录工作空间</h1><label htmlFor="username">用户名</label><input id="username" name="username" autoComplete="username" required autoFocus/><label htmlFor="password">密码</label><input id="password" name="password" type="password" autoComplete="current-password" required/>{loginError && <p role="alert" className="form-error">{loginError}</p>}<button className="button primary" disabled={loginBusy}>{loginBusy ? '登录中…' : '登录'}<ArrowRight size={17}/></button></form></main>

  const filteredProducts = workspace ? filterProducts(workspace.products, productFilter, query) : []
  const visibleSales = workspace ? filterSalesByProducts(workspace.sales, workspace.products, productFilter, month) : []
  const visibleProjects = workspace ? searchProjects(filterProjects(workspace.projects, workspace.tasks, workspace.entity_meta || [], projectFilter, localDate()), query) : []
  const activeProject = workspace?.projects.find(p => p.id === selectedProject) || visibleProjects[0]
  const activeTasks = workspace?.tasks.filter(t => t.project_id === activeProject?.id) || []
  const visibleReports = workspace?.reports.filter(item => reportFilter === 'all' || reportCategoryId(item, workspace.entity_meta || []) === reportFilter) || []
  const currentRoute = routeItems.find(item => item.id === route.split('/')[0]) || routeItems[0]
  const exceptionView = route.startsWith('exceptions/') ? route.split('/')[1] : ''
  const exceptionTitle = ({ tasks: '逾期任务', projects: '风险项目', signals: '负向反馈' } as Record<string, string>)[exceptionView]

  const monthControl = <div className="month-picker"><button className="icon-button" aria-label="上个月" onClick={() => shiftMonth(-1)}><ChevronLeft size={15}/></button><CalendarDays size={16}/><input aria-label="统计月份" type="month" value={month} onChange={e => { if (e.target.value) setMonth(e.target.value) }}/><button className="icon-button" aria-label="下个月" onClick={() => shiftMonth(1)}><ChevronRight size={15}/></button></div>
  function navigateOverview(to: string) {
    setQuery(''); setProjectFilter('all'); setProjectStageFilter('all'); setProjectDetailOpen(false); setProductFilter('all'); setReportFilter('all')
    if (to === 'knowledge') setKnowledgeContext(null)
    navigate(to)
  }

  return <div className="app">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus() }}>跳至主要内容</a>
    {menuOpen && <button className="nav-scrim" aria-label="收起导航" onClick={() => setMenuOpen(false)}/>}
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <a className="brand" href="#overview" aria-label={applicationName} onClick={() => setMenuOpen(false)}><Brand/></a>
      <div className="workspace-label"><span className="workspace-icon">英</span><div>英霏特项目空间</div></div>
      <nav aria-label="主导航">{navigationGroups.map(group => <div className="nav-group" key={group.title}><p className="nav-label">{group.title}</p>{group.ids.map(id => {
        const item = routeItems.find(item => item.id === id)!
        const active = route === item.id || route.startsWith(`${item.id}/`)
        return <a key={id} href={`#${id}`} className={`nav-item ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => { setMenuOpen(false); if (id === 'knowledge') setKnowledgeContext(null); if (id === 'projects') { setProjectDetailOpen(false);setProjectTableTarget(''); setProjectFilter('all'); setProjectStageFilter('all') } }}><item.icon size={18}/><span>{item.title}</span></a>
      })}</div>)}</nav>
      <div className="sidebar-bottom"><a href="#guide" className={`nav-item sidebar-guide ${isGuideRoute(route) ? 'active' : ''}`} aria-current={isGuideRoute(route) ? 'page' : undefined} onClick={() => setMenuOpen(false)}><CircleHelp size={18}/><span>使用说明</span></a><div className="profile"><span className="avatar">产</span><div>产品运营团队<small>{staticPreview ? (publishedPreviewEnabled ? '项目快照空间' : '演示工作空间') : ['demo', 'projects'].includes(mode) ? '本地工作空间' : '团队工作空间'}</small></div>{mode === 'production' ? <button className="icon-button" aria-label="退出登录" onClick={() => void action('logout', () => api('/auth/logout', 'POST', {}), '已退出')}><LogOut size={17}/></button> : <ShieldCheck size={17}/>}</div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="展开导航" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20}/></button><a className="topbar-brand" href="#overview" aria-label={applicationName}><Brand variant="compact"/></a><span>工作空间</span><ChevronRight size={13}/><strong>{exceptionTitle || currentRoute.title}</strong></div><div className="topbar-actions">{!isGuideRoute(route) && <a className="topbar-help" href={guideHrefFor(route)} aria-label={`查看${currentRoute.title}的使用说明`} title="使用说明"><CircleHelp size={17}/><span>使用说明</span></a>}<span className="live-indicator"><span className="status-dot"/>{loading ? '正在刷新' : error ? '连接异常' : staticPreview ? (publishedPreviewEnabled ? '项目数据预览' : '浏览器演示') : mode === 'projects' ? '本地项目空间' : mode === 'demo' ? '本地演示' : '数据已连接'}</span><button className={`icon-button ${loading ? 'spinning' : ''}`} aria-label="刷新数据" title="刷新数据" disabled={loading} onClick={() => void reload()}><RefreshCw size={16}/></button></div></header>
    <main id="main-content" tabIndex={-1} className={`content ${route === 'projects' ? 'project-content' : ''}`}><div className="page-heading"><div><h1>{exceptionTitle || currentRoute.title}</h1></div><div className="page-actions">
      {isGuideRoute(route) && <a className="button" href="#overview" onClick={event => { event.preventDefault(); navigateOverview('overview') }}>返回工作台<ArrowRight size={15}/></a>}
      {['products', 'reports'].includes(route) && monthControl}
      {['overview', 'projects'].includes(route) && <button className="button primary" onClick={() => openEditor('projects')}><Plus size={16}/>新建项目</button>}
      {route === 'products' && <button className="button primary" onClick={() => openEditor('products')}><Plus size={16}/>新建产品</button>}
      {route === 'signals' && <button className="button primary" onClick={() => openEditor('signals')}><Plus size={16}/>记录情报</button>}
      {route === 'reports' && <button className="button primary" disabled={!!busyKey} onClick={() => void generate()}><Sparkles size={16}/>{busyKey === 'generate' ? '生成中…' : '生成所选月报告'}</button>}
      {route === 'integrations' && <button className="button primary" onClick={() => openEditor('seats')}><Plus size={16}/>新增席位</button>}
    </div></div>
      {error && !isGuideRoute(route) && <div role="alert" className="error-banner"><span>{error}</span><button className="text-button" onClick={() => void reload()}>重新加载</button></div>}
      {isGuideRoute(route) ? <UsageGuide route={route} onNavigate={navigateOverview}/> : loading && !workspace ? <div className="loading"><RefreshCw className="spinning" size={24}/><p>正在连接产品工作空间…</p></div> : !workspace || !dashboard ? <Empty>工作空间未连接。</Empty> : <>
      {route === 'overview' && <OperationalOverview workspace={workspace} dashboard={dashboard} today={localDate()} monthControl={monthControl} onNavigate={navigateOverview}
        onProject={id => { setProjectFilter('all'); setProjectStageFilter('all'); setSelectedProject(id); setProjectDetailOpen(true); navigate('projects') }}
        onStage={stage => { setProjectFilter(`stage:${stage}`); setProjectStageFilter('all'); setProjectDetailOpen(false); setSelectedProject(''); navigate('projects') }}
        onDocuments={project => { setKnowledgeContext({ stage: (stages.includes(project.stage) ? project.stage : stages[0]) as Stage, projectId: project.id }); navigate('knowledge') }} onReport={setReport}/>}
      {route.startsWith('exceptions') && <ExceptionCenter workspace={workspace} today={localDate()} view={exceptionView} onNavigate={view => navigate(view ? `exceptions/${view}` : 'exceptions')} onProject={id => navigate(projectSheetHref(id))} onSignals={() => { navigate('signals') }}/>}
      {route === 'products' && <><ProductBoard products={workspace.products} sales={workspace.sales} month={month} filter={productFilter} onFilter={setProductFilter}/><div className="toolbar"><label className="search-field"><Search size={17}/><input aria-label="搜索产品" placeholder="搜索产品、SKU 或负责人" value={query} onChange={e => setQuery(e.target.value)}/></label><span className="count-label">{filteredProducts.length} 款产品</span></div><section className="section"><div className="table-wrap"><table className="data-table"><thead><tr><th>产品 / SKU</th><th>类别</th><th>负责人</th><th>状态</th><th>所选月净销售额</th><th className="align-right">操作</th></tr></thead><tbody>{filteredProducts.map((product, index) => <tr key={product.id}><td><span className="product-cell"><span className={`product-glyph glyph-${index % 3}`}><Boxes size={18}/></span><span><strong>{product.name}</strong><small>{product.sku}</small></span></span></td><td><SemanticTag kind="category" value={product.category}/></td><td>{product.owner}</td><td><Badge>{product.status}</Badge></td><td className="number">{money(workspace.sales.filter(s => s.product_id === product.id && s.month === month).reduce((a, s) => a + s.revenue_cents, 0), true)}</td><td className="align-right"><button className="icon-button" onClick={() => openEditor('products', product)} aria-label={`编辑 ${product.name}`}><Pencil size={16}/></button></td></tr>)}</tbody></table></div>{!filteredProducts.length && <Empty>暂无匹配产品。</Empty>}</section><section className="section sales-section"><SectionHeading title="月度销售明细" sub={month} action={<button className="button" onClick={() => openEditor('sales')}><Plus size={15}/>录入销售</button>}/><div className="table-wrap"><table className="data-table"><thead><tr><th>产品</th><th>月份</th><th>渠道</th><th>销量</th><th>净销售额</th><th className="align-right">操作</th></tr></thead><tbody>{visibleSales.map(sale => <tr key={sale.id}><td><strong>{productName(sale.product_id)}</strong></td><td>{sale.month}</td><td>{sale.channel}</td><td className="number">{sale.units} 件</td><td className="number">{money(sale.revenue_cents, true)}</td><td className="align-right"><button className="icon-button" onClick={() => openEditor('sales', sale)} aria-label={`编辑 ${productName(sale.product_id)} ${sale.channel} 销售`}><Pencil size={16}/></button></td></tr>)}</tbody></table></div>{!visibleSales.length && <Empty>当前筛选下暂无本月销售记录。</Empty>}</section></>}
      {route === 'projects' && <><ProjectWorkbook projects={visibleProjects} workspace={workspace} query={query} stage={projectStageFilter} today={localDate()} targetProjectId={projectTableTarget} activeFilter={projectFilter!=='all'} onQuery={setQuery} onStage={value=>{setProjectTableTarget('');setProjectStageFilter(value)}} onReset={()=>{setQuery('');setProjectFilter('all');setProjectStageFilter('all');setProjectTableTarget('');navigate('projects')}} onDetails={id=>{setSelectedProject(id);setProjectDetailOpen(true)}} onChanged={reload} onDocuments={project=>{setKnowledgeContext({stage:(stages.includes(project.stage)?project.stage:stages[0]) as Stage,projectId:project.id});navigate('knowledge')}} advancedFilters={<ProjectBoard projects={workspace.projects} tasks={workspace.tasks} meta={workspace.entity_meta||[]} categories={workspace.categories||[]} filter={projectFilter} today={localDate()} onFilter={setProjectFilter} onManage={()=>navigate('settings')}/>}/>{projectDetailOpen&&activeProject&&<ProjectDetailsDrawer onClose={()=>setProjectDetailOpen(false)}><ProjectWorkspace key={activeProject.id} project={activeProject} tasks={activeTasks} workspace={workspace} onBack={()=>setProjectDetailOpen(false)} onChanged={reload} onEditProject={()=>openEditor('projects',activeProject)} onEditTask={task=>openEditor('tasks',task)} onAddTask={()=>openEditor('tasks',undefined,{project_id:activeProject.id,owner:activeProject.owner})} onDocuments={()=>{setKnowledgeContext({stage:(stages.includes(activeProject.stage)?activeProject.stage:stages[0]) as Stage,projectId:activeProject.id});navigate('knowledge')}} onManage={()=>navigate('settings')}/></ProjectDetailsDrawer>}</>}
      {route === 'knowledge' && <KnowledgeBase key={knowledgeContext ? knowledgeContext.stage + knowledgeContext.projectId : 'knowledge'} projects={workspace.projects} documents={workspace.knowledge_documents || []} initialStage={knowledgeContext?.stage} initialProjectId={knowledgeContext?.projectId} onChanged={reload}/>}
      {route === 'signals' && <MarketIntelligence signals={workspace.signals} showManual={edit?.entity==='signals'} onEdit={row => openEditor('signals', row)}/>}
      {route === 'reports' && <><div className="report-category-tabs" role="tablist" aria-label="报告类型筛选"><button role="tab" aria-selected={reportFilter === 'all'} className={reportFilter === 'all' ? 'selected' : ''} onClick={() => setReportFilter('all')}>全部报告 <span>{workspace.reports.length}</span></button>{(workspace.categories || []).filter(item => item.scope === 'report' && (item.active || reportFilter === item.id || workspace.reports.some(report => reportCategoryId(report, workspace.entity_meta || []) === item.id))).map(category => <button key={category.id} data-tone={categoryTone(category.name)} style={toneStyle(categoryTone(category.name))} role="tab" aria-selected={reportFilter === category.id} className={reportFilter === category.id ? 'selected' : ''} onClick={() => setReportFilter(category.id)}>{category.name} <span>{workspace.reports.filter(item => reportCategoryId(item, workspace.entity_meta || []) === category.id).length}</span></button>)}</div><section className="section"><SectionHeading title="报告档案"/><div className="reports-list">{visibleReports.map(item => <div className="report-row" key={item.id} data-tone={categoryTone(workspace.categories?.find(category => category.id === reportCategoryId(item, workspace.entity_meta || []))?.name || '未分类')} style={toneStyle(categoryTone(workspace.categories?.find(category => category.id === reportCategoryId(item, workspace.entity_meta || []))?.name || '未分类'))}><span className="report-icon"><FileText size={21}/></span><button className="report-title" onClick={() => setReport(item)}><strong>{item.title}</strong><small>{item.month} · <SemanticTag kind="report" value={workspace.categories?.find(category => category.id === reportCategoryId(item, workspace.entity_meta || []))?.name || '未分类'}/> · {item.source} · {dateText(item.generated_at)}</small></button><DownloadButton report={item}/><button className="icon-button" onClick={() => setReport(item)} aria-label={`阅读 ${item.title}`}><ArrowRight size={18}/></button></div>)}</div>{!visibleReports.length && <Empty>当前类型暂无报告。</Empty>}</section><section className="section jobs-section"><SectionHeading title="定时报告任务" action={<button className="button" onClick={() => openEditor('jobs')}><Plus size={15}/>新建任务</button>}/><div className="table-wrap"><table className="data-table"><thead><tr><th>任务名称</th><th>频率</th><th>下一次执行</th><th>上次执行</th><th>状态</th><th className="align-right">操作</th></tr></thead><tbody>{workspace.jobs.map(job => <tr key={job.id}><td><strong>{job.name}</strong></td><td>{{ daily: '每天', weekly: '每周', monthly: '每月' }[job.frequency] || job.frequency}</td><td>{dateText(job.next_run_at)}</td><td>{dateText(job.last_run_at)}</td><td><button className={`switch ${job.enabled ? 'on' : ''}`} role="switch" aria-checked={job.enabled} aria-label={`${job.name}自动执行`} disabled={!!busyKey} onClick={() => void action(job.id, () => api(`/jobs/${job.id}`, 'PATCH', { enabled: !job.enabled }), job.enabled ? '任务已暂停' : '任务已启用')}><i/></button><span className="switch-label">{job.enabled ? '启用' : '暂停'}</span></td><td className="align-right"><div className="inline-actions"><button className="text-button" disabled={!!busyKey} onClick={() => void action(`run-${job.id}`, async () => { const result = await api<Report>(`/jobs/${job.id}/run`, 'POST', {}); setReport(result) }, '任务已执行，报告已生成')}><Play size={14}/>{busyKey === `run-${job.id}` ? '执行中' : '执行当月'}</button><button className="icon-button" aria-label={`编辑 ${job.name}`} onClick={() => openEditor('jobs', job)}><Settings2 size={16}/></button></div></td></tr>)}</tbody></table></div>{!workspace.jobs.length && <Empty>暂无报告任务。</Empty>}</section></>}
      {route === 'settings' && <ClassificationSettings categories={workspace.categories || []} fields={workspace.custom_fields || []} onChanged={reload}/>}{route === 'integrations' && <><section className="section"><SectionHeading title="服务接入计划" sub={`${workspace.seats.length} 个配置席位`}/>{workspace.seats.map(seat => <div className="seat-row" key={seat.id}><span className="seat-icon">{seat.kind === 'AI 总结' ? <Sparkles size={23}/> : seat.kind === '销售数据' ? <BarChart3 size={23}/> : <Radar size={23}/>}</span><div className="seat-body"><div><h3>{seat.name}</h3><Badge>{seat.status}</Badge></div><p>{seat.provider} <span>·</span> {seat.kind}</p><small>{seat.note || '暂无接入说明'}</small></div><button className="button" onClick={() => openEditor('seats', seat)}><Settings2 size={16}/>配置</button></div>)}{!workspace.seats.length && <Empty>暂无集成席位。</Empty>}</section></>}
      </>}
      <footer className="main-footer"><span>{applicationName}</span><span>{staticPreview ? (publishedPreviewEnabled ? '项目快照预览' : '静态预览') : mode === 'projects' ? '本地项目空间' : mode === 'demo' ? '本地演示' : '线上工作空间'}</span></footer>
    </main></div>{edit && <Editor key={`${edit.entity}-${edit.id || 'new'}`} edit={edit} onClose={() => setEdit(null)} onSave={save}/>} {report && workspace && <ReportPreview report={report} workspace={workspace} onChanged={reload} onManage={() => { setReport(null); navigate('settings') }} onClose={() => setReport(null)}/>} {toast && <div role="status" className="toast"><Check size={17}/>{toast}</div>}</div>
}
