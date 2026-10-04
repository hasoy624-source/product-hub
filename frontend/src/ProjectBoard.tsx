import { Settings2, X } from 'lucide-react'
import { boardCounts } from './classification'
import { stageTone, toneStyle } from './semantics'
import type { Category, EntityMeta, Project, Task } from './types'

type Props = {
  projects: Project[]
  tasks: Task[]
  meta: EntityMeta[]
  categories: Category[]
  filter: string
  today: string
  onFilter: (filter: string) => void
  onManage: () => void
}

export default function ProjectBoard({ projects, tasks, meta, categories, filter, today, onFilter, onManage }: Props) {
  const cards = boardCounts(projects, tasks, meta, categories, today)
  const statuses = [...new Set(projects.map(project => project.status))]
  const categoryCards = cards.slice(3)
  return <section className="project-board project-filter-bar" aria-label="项目筛选">
    <div className="project-quick-filters" aria-label="常用项目筛选">{[cards[0], cards[2], cards[1]].map(item => <button key={item.id} className={`project-filter ${filter === item.id ? 'selected' : ''} ${item.id === 'overdue' ? 'filter-overdue' : ''}`} aria-pressed={filter === item.id} onClick={() => onFilter(item.id)}>{item.label}<span>{item.count}</span></button>)}</div>
    <div className="project-select-filters"><label><span>状态</span><select aria-label="项目状态筛选" value={filter.startsWith('status:') ? filter : ''} onChange={event => onFilter(event.target.value || 'all')}><option value="">全部状态</option>{statuses.map(status => <option key={status} value={`status:${status}`}>{status} · {projects.filter(project => project.status === status).length}</option>)}</select></label><label><span>品类</span><select aria-label="项目品类筛选" value={categoryCards.some(item => item.id === filter) ? filter : ''} onChange={event => onFilter(event.target.value || 'all')}><option value="">全部品类</option>{categoryCards.map(item => <option key={item.id} value={item.id}>{item.label} · {item.count}</option>)}</select></label></div>
    {filter.startsWith('stage:') && <div className="project-stage-filter" style={toneStyle(stageTone(filter.slice(6)))}><span>{filter.slice(6)} · 进行中</span><button className="icon-button" onClick={() => onFilter('all')} aria-label="清除阶段筛选"><X size={14}/></button></div>}
    <button className="icon-button project-filter-settings" onClick={onManage} aria-label="管理分类与字段" title="管理分类与字段"><Settings2 size={17}/></button>
  </section>
}
