import type { Dashboard, Job, Product, Project, Report, Sale, Seat, Signal, Task, Workspace } from './types'

const STORAGE_KEY = 'zhixu-public-preview-v1'
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
const currentMonth = () => today().slice(0, 7)
function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number)
  const d = new Date(Date.UTC(year, number - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function percent(amount: number, total: number) { return total ? Math.round(amount / total * 10000) / 100 : 0 }
function uuid() { return globalThis.crypto?.randomUUID?.() ?? `preview-${Date.now()}-${Math.random().toString(36).slice(2)}` }

function seed(): Workspace {
  const month = currentMonth()
  const products: Product[] = [
    { id: 'demo-p1', name: '智能舒眠颈枕', sku: 'REST-01', category: '智能健康', status: '在售', owner: '林悦', description: '演示虚构产品 · 温感支撑与旅途舒眠' },
    { id: 'demo-p2', name: '便携筋膜按摩仪', sku: 'MOVE-02', category: '运动恢复', status: '在售', owner: '陈知远', description: '演示虚构产品 · 轻量化便携设计' },
    { id: 'demo-p3', name: '桌面空气净化器', sku: 'AIR-03', category: '智能家居', status: '在售', owner: '周可', description: '演示虚构产品 · 桌面清新空气' },
    { id: 'demo-p4', name: '睡眠监测眼罩', sku: 'SLEEP-04', category: '智能健康', status: '研发中', owner: '林悦', description: '演示虚构产品 · 正在进行工程验证' },
    { id: 'demo-p5', name: '便携冷热杯', sku: 'CUP-05', category: '生活方式', status: '研发中', owner: '苏禾', description: '演示虚构产品 · 概念验证阶段' },
  ]
  const sales: Sale[] = []
  for (let offset = -5; offset <= 0; offset++) {
    const period = shiftMonth(month, offset)
    const amounts = [18_960_000 + (offset + 5) * 1_360_000, 6_820_000 + (offset + 5) * 310_000, 2_260_000 + (offset + 5) * 190_000]
    amounts.forEach((amount, index) => sales.push({ id: `demo-sale-${offset + 5}-${index + 1}`, product_id: `demo-p${index + 1}`, month: period, revenue_cents: amount, units: Math.floor(amount / (index === 0 ? 29_900 : 39_900)), channel: '独立站', note: '演示虚构数据，不代表实际营收' }))
  }
  const projects: Project[] = [
    ['demo-project-1', '睡眠眼罩 · 工程验证', 'demo-p4', 'EVT', '风险', '林悦', 54],
    ['demo-project-2', '颈枕 2.0 · 结构升级', 'demo-p1', '设计与开发', '正常', '陈知远', 32],
    ['demo-project-3', '冷热杯 · 需求探索', 'demo-p5', '概念与启动', '正常', '苏禾', 15],
    ['demo-project-4', '净化器 · 可靠性验证', 'demo-p3', 'DVT', '正常', '周可', 76],
    ['demo-project-5', '按摩仪 · 量产准备', 'demo-p2', 'MP', '正常', '陈知远', 92],
  ].map(([id, name, product_id, stage, status, owner, progress], index) => ({ id: String(id), name: String(name), product_id: String(product_id), stage: String(stage), status: String(status), owner: String(owner), progress: Number(progress), due_date: new Date(Date.now() + (index + 1) * 604_800_000).toISOString().slice(0, 10), description: '演示研发项目；阶段推进由负责人确认' }))
  const tasks: Task[] = projects.map((project, index) => ({ id: `demo-task-${index + 1}`, project_id: project.id, title: ['完成传感器稳定性测试', '确认结构设计评审意见', '整理首轮用户访谈', '完成跌落与寿命测试', '确认小批量试产清单'][index], owner: project.owner, due_date: new Date(Date.now() + (index - 2) * 86_400_000).toISOString().slice(0, 10), status: index < 2 ? '进行中' : '待办' }))
  const occurred = (offset: number) => { const d = new Date(`${today()}T12:00:00+08:00`); d.setDate(Math.max(1, d.getDate() + offset)); return `${currentMonth()}-${String(d.getDate()).padStart(2, '0')}` }
  const signals: Signal[] = [
    ['竞品动态', 'NorthRest（虚构）', '新款旅行颈枕发布', '演示动态：增加可拆洗面料，主打轻量化旅行场景。', '中性', -1],
    ['竞品动态', 'CalmLoop（虚构）', '启动秋季组合促销', '演示动态：以眼罩与颈枕组合销售；实际价格与活动均待人工核实。', '中性', -4],
    ['市场反馈', '用户访谈（虚构）', '用户期待更轻的机身', '演示访谈：通勤人群认为设备体积仍有优化空间。', '负向', -2],
    ['独立站评价', '演示顾客 A', '颈部支撑感提升', '演示评价：长途出行使用更舒适，收纳也很方便。', '正向', -3],
    ['独立站评价', '演示顾客 B', '说明书需要更清晰', '演示评价：首次配对步骤略复杂，建议增加图示。', '负向', -1],
  ].map(([kind, brand, title, content, sentiment, offset], index) => ({ id: `demo-signal-${index + 1}`, kind: String(kind), brand: String(brand), title: String(title), content: String(content), sentiment: String(sentiment), source_url: '', occurred_on: occurred(Number(offset)) }))
  const seats: Seat[] = [
    { id: 'demo-seat-1', name: 'AI 洞察席位', kind: 'AI 总结', provider: '待选择模型供应商', status: '待接入', note: '配置占位，当前未发起任何外部请求' },
    { id: 'demo-seat-2', name: '独立站销售席位', kind: '销售数据', provider: '待配置电商平台', status: '待接入', note: '配置占位，当前未发起任何外部请求' },
    { id: 'demo-seat-3', name: '独立站评价席位', kind: '评价采集', provider: '待配置评价来源', status: '待接入', note: '配置占位，当前未发起任何外部请求' },
  ]
  const next = new Date(`${shiftMonth(month, 1)}-01T09:00:00+08:00`).toISOString()
  const jobs: Job[] = [{ id: 'demo-job-1', name: '竞品与市场月报', frequency: 'monthly', enabled: true, next_run_at: next, last_run_at: null }]
  return { products, sales, projects, tasks, signals, seats, jobs, reports: [createReport(month, null, products, sales, signals)], activity: [{ id: 'activity-1', action: '初始化演示空间：全部产品、品牌、销售与评价均为虚构样例', created_at: new Date().toISOString() }] }
}

function dashboard(workspace: Workspace, month: string): Dashboard {
  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(month, index - 5))
  const totals = new Map(months.map(item => [item, 0]))
  const byProduct = new Map<string, number>()
  for (const sale of workspace.sales) {
    if (totals.has(sale.month)) totals.set(sale.month, (totals.get(sale.month) || 0) + sale.revenue_cents)
    if (sale.month === month) byProduct.set(sale.product_id, (byProduct.get(sale.product_id) || 0) + sale.revenue_cents)
  }
  const total = totals.get(month) || 0
  const products = workspace.products.map(product => ({ product_id: product.id, name: product.name, category: product.category, revenue_cents: byProduct.get(product.id) || 0, share: percent(byProduct.get(product.id) || 0, total) })).sort((a, b) => b.revenue_cents - a.revenue_cents || a.name.localeCompare(b.name))
  const categories = new Map<string, number>()
  for (const product of workspace.products) categories.set(product.category, (categories.get(product.category) || 0) + (byProduct.get(product.id) || 0))
  const active = workspace.projects.filter(project => project.status !== '暂停' && project.status !== '已完成').length
  const prior = totals.get(shiftMonth(month, -1)) || 0
  return {
    month, revenue_cents: total, previous_revenue_cents: prior,
    growth_pct: prior ? Math.round((total - prior) / prior * 10000) / 100 : null,
    top_product_share: products[0]?.share || 0, risk_threshold: 60, product_count: workspace.products.length,
    active_projects: active, overdue_tasks: workspace.tasks.filter(task => task.status !== '已完成' && task.due_date < today()).length,
    product_sales: products, trend: months.map(item => ({ month: item, revenue_cents: totals.get(item) || 0 })),
    category_sales: Array.from(categories, ([category, revenue_cents]) => ({ category, revenue_cents, share: percent(revenue_cents, total) })).sort((a, b) => b.revenue_cents - a.revenue_cents || a.category.localeCompare(b.category)),
  }
}

function createReport(month: string, jobId: string | null, products: Product[], sales: Sale[], signals: Signal[]): Report {
  const revenue = sales.filter(sale => sale.month === month).reduce((sum, sale) => sum + sale.revenue_cents, 0)
  const byProduct = new Map<string, number>()
  for (const sale of sales.filter(item => item.month === month)) byProduct.set(sale.product_id, (byProduct.get(sale.product_id) || 0) + sale.revenue_cents)
  const top = revenue ? Math.max(0, ...byProduct.values()) / revenue * 100 : 0
  const records = signals.filter(signal => signal.occurred_on.slice(0, 7) === month)
  const lines = [`# ${month} 竞品与市场月报`, '', '> 生成方式：规则汇总。预览使用本地虚构数据；仅汇总浏览器中的演示样例，未调用 AI 或外部数据服务。', '', '## 数据概览', `- 净销售额：¥${(revenue / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`, `- 第一产品销售占比：${top.toFixed(2)}%（预警阈值 60%）`, `- 市场情报：${records.length} 条`, '', '## 产品排名']
  for (const product of products.slice().sort((a, b) => (byProduct.get(b.id) || 0) - (byProduct.get(a.id) || 0))) lines.push(`- ${product.name}：¥${((byProduct.get(product.id) || 0) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`)
  for (const kind of ['竞品动态', '市场反馈', '独立站评价']) {
    const items = records.filter(signal => signal.kind === kind)
    lines.push('', `## ${kind}（${items.length} 条）`)
    if (!items.length) lines.push('本月暂无已录入记录。')
    for (const item of items) lines.push(`### ${item.occurred_on} · ${item.brand} · ${item.title}`, `情绪标签：${item.sentiment}`, '', item.content, '')
  }
  lines.push('## 提示', '以上内容仅作交互预览，初始数据均为虚构样例。')
  return { id: uuid(), title: `${month} 竞品与市场月报`, month, content: lines.join('\n'), generated_at: new Date().toISOString(), job_id: jobId, source: '规则汇总' }
}

function save(workspace: Workspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
}
function load(): Workspace {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) { const initial = seed(); save(initial); return initial }
  try { return JSON.parse(stored) as Workspace } catch { const initial = seed(); save(initial); return initial }
}
function record(workspace: Workspace, action: string) {
  workspace.activity.unshift({ id: uuid(), action, created_at: new Date().toISOString() })
  workspace.activity = workspace.activity.slice(0, 50)
}

export async function previewApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const [pathname, queryString = ''] = path.split('?', 2)
  const query = new URLSearchParams(queryString)
  const verb = method.toUpperCase()
  if (pathname === '/health' && verb === 'GET') return { status: 'ok', mode: 'demo' } as T
  if (pathname === '/auth/login' && verb === 'POST') return { authenticated: true, username: '预览访客', mode: 'demo' } as T
  if (pathname === '/auth/logout' && verb === 'POST') return { authenticated: false } as T
  const workspace = load()
  if (pathname === '/workspace' && verb === 'GET') return structuredClone(workspace) as T
  if (pathname === '/dashboard' && verb === 'GET') return dashboard(workspace, query.get('month') || currentMonth()) as T
  if (pathname === '/reports/generate' && verb === 'POST') {
    const payload = body as { month?: string }
    const month = payload?.month || currentMonth()
    const report = createReport(month, null, workspace.products, workspace.sales, workspace.signals)
    workspace.reports.unshift(report); record(workspace, `生成预览规则月报：${month}`); save(workspace)
    return report as T
  }
  const runMatch = pathname.match(/^\/jobs\/([^/]+)\/run$/)
  if (runMatch && verb === 'POST') {
    const job = workspace.jobs.find(item => item.id === runMatch[1])
    if (!job) throw new ApiError('定时任务不存在', 404)
    job.last_run_at = new Date().toISOString()
    const report = createReport(currentMonth(), job.id, workspace.products, workspace.sales, workspace.signals)
    workspace.reports.unshift(report); record(workspace, `手动运行预览任务并生成月报：${job.name}`); save(workspace)
    return report as T
  }
  const entityMatch = pathname.match(/^\/(products|sales|projects|tasks|signals|seats|jobs)(?:\/([^/]+))?$/)
  if (entityMatch && ['POST', 'PATCH'].includes(verb)) {
    const [, entity, id] = entityMatch
    const collection = workspace[entity as keyof Pick<Workspace, 'products' | 'sales' | 'projects' | 'tasks' | 'signals' | 'seats' | 'jobs'>] as unknown as Array<Record<string, unknown>>
    const input = (body || {}) as Record<string, unknown>
    if (verb === 'PATCH') {
      const target = collection.find(item => item.id === id)
      if (!target) throw new ApiError('记录不存在', 404)
      Object.assign(target, input)
      record(workspace, `更新 ${entity}：${String(target.name || target.title || id)}`)
      save(workspace)
      return structuredClone(target) as T
    }
    if (entity === 'sales') {
      const sale = input as unknown as Sale
      if (collection.some(item => item.product_id === sale.product_id && item.month === sale.month && item.channel === sale.channel)) throw new ApiError('记录冲突：产品、月份、渠道组合已存在', 409)
      if (!workspace.products.some(product => product.id === sale.product_id)) throw new ApiError('关联产品不存在', 422)
    }
    if (entity === 'projects' && input.product_id && !workspace.products.some(product => product.id === input.product_id)) throw new ApiError('关联产品不存在', 422)
    if (entity === 'tasks' && !workspace.projects.some(project => project.id === input.project_id)) throw new ApiError('关联项目不存在', 422)
    const created = { id: uuid(), ...input } as Record<string, unknown>
    collection.push(created)
    record(workspace, `新增 ${entity}：${String(created.name || created.title || '预览记录')}`)
    save(workspace)
    return structuredClone(created) as T
  }
  throw new ApiError('预览模式不支持此操作', 404)
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export function resetPreview() { localStorage.removeItem(STORAGE_KEY) }
