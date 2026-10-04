import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, CircleAlert, FileCheck2, FileText, FlaskConical, ListTodo } from 'lucide-react'
import type { ReactNode } from 'react'
import { ExceptionMetric } from './ExceptionCenter'
import { operationalOverview } from './overview-model'
import SemanticTag from './SemanticTag'
import { categoryTone, stageTone, toneStyle } from './semantics'
import type { Stage } from './knowledge-catalog'
import type { Dashboard, Project, Report, Workspace } from './types'

type Props = {
  workspace: Workspace
  dashboard: Dashboard
  today: string
  monthControl: ReactNode
  onNavigate: (route: string) => void
  onProject: (id: string) => void
  onStage: (stage: Stage) => void
  onDocuments: (project: Project) => void
  onReport: (report: Report) => void
}

const money = (cents: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(cents / 100)

function SalesTrend({ dashboard }: { dashboard: Dashboard }) {
  const points = dashboard.trend
  if (!points.length) return <p className="ops-empty">暂无销售记录。</p>
  const max = Math.max(...points.map(point => point.revenue_cents), 100)
  const width = 650, height = 150, top = 14, bottom = 136
  const xy = points.map((point, index) => [6 + index * 638 / Math.max(points.length - 1, 1), bottom - point.revenue_cents / max * (bottom - top)])
  const path = xy.map(([x, y], index) => `${index ? 'L' : 'M'}${x},${y}`).join(' ')
  return <div className="ops-trend"><div className="ops-chart-scale"><span>{money(max)}</span><span>{money(max / 2)}</span><span>¥0</span></div><div className="ops-chart-main"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={points.map(point => `${point.month}：${money(point.revenue_cents)}`).join('；')}>
    {[top, (top + bottom) / 2, bottom].map(y => <line key={y} x1="0" y1={y} x2={width} y2={y} stroke="var(--line)" strokeDasharray="3 5"/>)}
    <path d={`${path} L${xy.at(-1)![0]},${bottom} L${xy[0][0]},${bottom} Z`} fill="var(--accent-soft)"/>
    <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round"/>
    {xy.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={index === points.length - 1 ? 4 : 3} fill="var(--surface)" stroke="var(--accent)" strokeWidth="2"><title>{points[index].month} · {money(points[index].revenue_cents)}</title></circle>)}
  </svg><div className="ops-chart-months">{points.map(point => <span key={point.month}>{Number(point.month.slice(5))}月</span>)}</div></div></div>
}

export default function OperationalOverview({ workspace, dashboard, today, monthControl, onNavigate, onProject, onStage, onDocuments, onReport }: Props) {
  const model = operationalOverview(workspace, today)
  const productSales = dashboard.product_sales.filter(product => product.revenue_cents > 0).slice(0, 3)
  return <div className="operational-overview">
    <div className="ops-summary" aria-label="工作状态">
      <span><FlaskConical size={15}/><strong>{model.activeCount}</strong> 个在研项目</span>
      <span><ListTodo size={15}/><strong>{model.openTaskCount}</strong> 项待完成任务</span>
      <span><FileCheck2 size={15}/><strong>{model.reviewDocumentCount}</strong> 份待评审文档</span>
    </div>

    <section className="ops-focus ops-surface" aria-label="工作优先级">
      <div className="ops-inbox">
        <div className="ops-section-head"><div><h2>待处理事项 <span className="ops-count">{model.focus.length}</span></h2></div><button className="text-button" onClick={() => onNavigate('exceptions')}>全部异常<ArrowRight size={15}/></button></div>
        <div className="ops-focus-list">{model.focus.slice(0, 3).map(item => <button key={item.id} className={`ops-focus-row ${item.kind}`} data-tone={item.kind === 'task' ? 'red' : 'amber'} style={toneStyle(item.kind === 'task' ? 'red' : 'amber')} onClick={() => item.projectId && workspace.projects.some(project => project.id === item.projectId) ? onProject(item.projectId) : onNavigate('exceptions/tasks')}>
          <span className="ops-focus-icon">{item.kind === 'task' ? <CalendarClock size={18}/> : <CircleAlert size={18}/>}</span>
          <span className="ops-focus-copy"><strong>{item.title}</strong><small>{item.context} · {item.owner}</small></span>
          <span className="ops-focus-meta"><span className={`ops-state ${item.kind === 'task' ? 'danger' : 'warning'}`}>{item.kind === 'task' ? `逾期 ${item.overdueDays} 天` : '项目风险'}</span><small>{item.dueDate.slice(5).replace('-', '/')} 截止</small></span><ArrowRight className="ops-row-arrow" size={15}/>
        </button>)}</div>
        {!model.focus.length && <div className="ops-empty-state"><CheckCircle2 size={24}/><strong>当前没有逾期任务或风险项目</strong><button className="text-button" onClick={() => onNavigate('projects')}>查看研发项目<ArrowRight size={15}/></button></div>}
      </div>
      <aside className="ops-alerts"><ExceptionMetric workspace={workspace} today={today}/></aside>
    </section>

    <section className="ops-workflow ops-surface" aria-label="研发推进">
      <div className="ops-section-head"><div><h2>研发推进</h2></div><button className="text-button" onClick={() => onNavigate('projects')}>全部项目<ArrowRight size={15}/></button></div>
      <div className="ops-stages" aria-label="按研发阶段筛选项目">{model.stages.map((stage, index) => <button key={stage.id} data-tone={stageTone(stage.id)} style={toneStyle(stageTone(stage.id))} onClick={() => onStage(stage.id)} aria-label={`${stage.title}，${stage.count}个在研项目`}>
        <span className="ops-stage-top"><span className="ops-step">{String(index + 1).padStart(2, '0')}</span><span className="ops-stage-name">{stage.title}<small>{stage.subtitle}</small></span></span>
        <span className="ops-stage-bottom"><strong>{stage.count}<small> 个项目</small></strong>{stage.riskCount > 0 && <span className="ops-stage-risk" style={toneStyle('amber')}>{stage.riskCount} 项风险</span>}</span>
      </button>)}</div>
      <div className="ops-project-table">
        <div className="ops-project-labels"><span>当前项目</span><span>阶段</span><span>负责人</span><span>进度</span><span>输出文档</span></div>
        {model.projects.map(project => <div className="ops-project-row" key={project.id} data-tone={stageTone(project.stage)} style={toneStyle(stageTone(project.stage))}>
          <button className="ops-project-main" onClick={() => onProject(project.id)} aria-label={`查看项目 ${project.name}`}><span className="ops-project-name"><span className={`ops-project-dot ${project.status === '风险' ? 'risk' : ''}`}/><span><strong>{project.name}</strong><small><span className="ops-project-mobile-stage"><SemanticTag kind="stage" value={project.stage}/></span>计划 {project.due_date}</small></span></span><span className="ops-project-stage"><SemanticTag kind="stage" value={project.stage}/></span><span className="ops-project-owner">{project.owner || '待指定'}</span><span className="ops-project-progress"><i><b style={{ width: `${project.progress}%` }}/></i><small>{project.progress}%</small></span></button>
          <button className="ops-document-link" onClick={() => onDocuments(project)} aria-label={`查看 ${project.name} 的阶段文档`}><FileText size={15}/><span>阶段文档</span><ArrowRight size={13}/></button>
        </div>)}
        {!model.projects.length && <p className="ops-empty">暂无在研项目。</p>}
      </div>
    </section>

    <section className="ops-business ops-surface" aria-label="经营监测">
      <div className="ops-performance"><div className="ops-section-head"><div><h2>经营表现</h2><p>所选月净销售额 · CNY</p></div>{monthControl}</div>
        <div className="ops-revenue"><strong>{money(dashboard.revenue_cents)}</strong>{dashboard.growth_pct !== null ? <span className={dashboard.growth_pct < 0 ? 'down' : ''}>{dashboard.growth_pct < 0 ? <ArrowDownRight size={16}/> : <ArrowUpRight size={16}/>} {Math.abs(dashboard.growth_pct).toFixed(1)}%<small>较上月</small></span> : <small>上月无销售，暂无环比</small>}</div>
        <SalesTrend dashboard={dashboard}/>
      </div>
      <div className="ops-product-mix"><div className="ops-section-head"><h2>产品销售结构</h2><button className="text-button" onClick={() => onNavigate('products')}>明细<ArrowRight size={15}/></button></div>
        {productSales.map((product, index) => <button className="ops-product-sale" key={product.product_id} data-tone={categoryTone(product.category)} style={toneStyle(categoryTone(product.category))} onClick={() => onNavigate('products')}><span className="ops-product-sale-title"><small>{String(index + 1).padStart(2, '0')}</small><strong>{product.name}</strong><span>{product.share.toFixed(1)}%</span></span><span className="ops-product-bar"><i style={{ width: `${product.share}%` }}/></span><span className="ops-product-sale-foot"><SemanticTag kind="category" value={product.category}/><strong>{money(product.revenue_cents)}</strong></span></button>)}
        {!productSales.length && <p className="ops-empty">所选月暂无销售记录。</p>}
      </div>
    </section>

    <div className="ops-secondary">
      <section><div className="ops-section-head"><h2>近期市场反馈</h2><button className="text-button" onClick={() => onNavigate('signals')}>全部情报<ArrowRight size={15}/></button></div>{model.signals.map(signal => <button key={signal.id} className="ops-secondary-row" onClick={() => onNavigate('signals')}><span className={`ops-signal-dot ${signal.sentiment === '负向' ? 'negative' : ''}`}/><span><strong>{signal.title}</strong><small><SemanticTag kind="signal" value={signal.kind}/> · {signal.brand}</small></span><time>{signal.occurred_on.slice(5).replace('-', '/')}</time><ArrowRight size={14}/></button>)}{!model.signals.length && <p className="ops-empty">暂无市场反馈。</p>}</section>
      <section><div className="ops-section-head"><h2>最新报告</h2><button className="text-button" onClick={() => onNavigate('reports')}>报告档案<ArrowRight size={15}/></button></div>{model.reports.map(report => <button key={report.id} className="ops-secondary-row" onClick={() => onReport(report)}><FileText size={17}/><span><strong>{report.title}</strong><small>{report.month} · {report.source}</small></span><ArrowRight size={14}/></button>)}{!model.reports.length && <p className="ops-empty">暂无报告。</p>}</section>
    </div>
  </div>
}
