import { ArrowLeft, ArrowRight, CalendarClock, CircleAlert, MessageSquareWarning } from 'lucide-react'
import { exceptionDetails } from './exceptions'
import type { ExceptionView } from './exceptions'
import type { Workspace } from './types'

type Props = {
  workspace: Workspace
  today: string
  view?: string
  onNavigate: (view: ExceptionView | '') => void
  onProject: (id: string) => void
  onSignals: () => void
}

function Donut({ groups, total, compact = false }: { groups: ReturnType<typeof exceptionDetails>['groups']; total: number; compact?: boolean }) {
  let offset = 0
  const stops = groups.filter(group => group.count).map(group => {
    const start = offset
    offset += group.count / total * 100
    return `${group.color} ${start}% ${offset}%`
  })
  return <div className={`exception-donut ${compact ? 'compact' : ''}`} role="img" aria-label={total ? groups.map(group => `${group.label} ${group.count} 项`).join('，') : '当前没有异常条目'} style={{ background: total ? `conic-gradient(${stops.join(',')})` : '#e6eaf1' }}>
    <div><strong>{total}</strong><span>异常条目</span></div>
  </div>
}

export function ExceptionMetric({ workspace, today }: Pick<Props, 'workspace' | 'today'>) {
  const { groups, total } = exceptionDetails(workspace, today)
  const circumference = 2 * Math.PI * 33
  let offset = 0
  return <section className="metric exception-metric" aria-label="异常概览">
    <h2><a className="exception-metric-heading" href="#exceptions">异常概览<ArrowRight size={14}/></a></h2>
    <div className="exception-metric-body">
      <div className="exception-metric-chart">
        <svg viewBox="0 0 88 88" role="group" aria-label="点击扇区查看对应异常">
          <circle cx="44" cy="44" r="33" fill="none" stroke="#e7eaf1" strokeWidth="13"/>
          {total > 0 && groups.map(group => {
            const length = group.count / total * circumference
            const start = offset
            offset += length
            return group.count > 0 && <a key={group.id} href={`#exceptions/${group.id}`} aria-label={`查看${group.label}，${group.count}项`}>
              <circle cx="44" cy="44" r="33" fill="none" stroke={group.color} strokeWidth="13" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-start} transform="rotate(-90 44 44)" className="exception-metric-segment"><title>{group.label} · {group.count} 项</title></circle>
            </a>
          })}
        </svg>
        <a className="exception-metric-total" href="#exceptions" aria-label={`查看全部${total}项异常`}>{total}<small>项</small></a>
      </div>
      <div className="exception-metric-legend">{groups.map(group => <a key={group.id} href={`#exceptions/${group.id}`} aria-label={`查看${group.label}，${group.count}项`}><i style={{ background: group.color }}/><span>{group.label}</span><strong>{group.count}</strong></a>)}</div>
    </div>
  </section>
}

export default function ExceptionCenter({ workspace, today, view, onNavigate, onProject, onSignals }: Props) {
  const details = exceptionDetails(workspace, today)
  const active = details.groups.find(group => group.id === view)
  if (active) return <div className="exception-center">
    <button className="exception-back" onClick={() => onNavigate('')}><ArrowLeft size={15}/>返回异常概览</button>
    <div className="exception-detail-heading"><h2>{active.label}</h2><strong style={{ color: active.color }}>{active.count}<small> 项</small></strong></div>
    {active.id === 'tasks' && <div className="exception-detail-list">{details.tasks.map(task => {
      const project = workspace.projects.find(item => item.id === task.project_id)
      return <button className="exception-detail-row" key={task.id} onClick={() => onProject(task.project_id)}><span className="exception-detail-icon"><CalendarClock size={19}/></span><span className="exception-detail-main"><strong>{task.title}</strong><small>{project?.name || '未关联项目'} · 负责人 {task.owner || '待指定'}</small></span><span className="exception-detail-meta">截止 {task.due_date}</span><ArrowRight size={16}/></button>
    })}</div>}
    {active.id === 'projects' && <div className="exception-detail-list">{details.projects.map(project => <button className="exception-detail-row" key={project.id} onClick={() => onProject(project.id)}><span className="exception-detail-icon"><CircleAlert size={19}/></span><span className="exception-detail-main"><strong>{project.name}</strong><small>{project.stage} · 负责人 {project.owner || '待指定'} · 进度 {project.progress}%</small></span><span className="exception-detail-meta">计划 {project.due_date}</span><ArrowRight size={16}/></button>)}</div>}
    {active.id === 'signals' && <div className="exception-detail-list">{details.signals.map(signal => <article className="exception-detail-row exception-signal-row" key={signal.id}><span className="exception-detail-icon"><MessageSquareWarning size={19}/></span><span className="exception-detail-main"><strong>{signal.title}</strong><small>{signal.kind} · {signal.brand} · {signal.occurred_on}</small><p>{signal.content}</p></span><button className="text-button" onClick={onSignals}>市场情报<ArrowRight size={15}/></button></article>)}</div>}
    {!active.count && <div className="exception-empty">当前没有{active.label}。</div>}
  </div>

  return <div className="exception-center">
    <section className="exception-hero"><div className="exception-hero-total"><strong>{details.total}</strong><span>项待关注记录</span></div><Donut groups={details.groups} total={details.total}/></section>
    <div className="exception-groups">{details.groups.map(group => <button className="exception-group" key={group.id} onClick={() => onNavigate(group.id)}><span className="exception-group-marker" style={{ background: group.color }}/><span className="exception-group-copy"><strong>{group.label}</strong></span><span className="exception-group-count">{group.count}<small>项</small></span><ArrowRight size={17}/></button>)}</div>
  </div>
}
