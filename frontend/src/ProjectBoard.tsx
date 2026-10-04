import { ArrowRight, X } from 'lucide-react'
import { boardCounts } from './classification'
import { categoryTone, stageTone, statusTone, toneStyle } from './semantics'
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
  const renderFilter = (item: typeof cards[number]) => {
    const tone = ['all', 'active', 'overdue'].includes(item.id) ? statusTone(item.label) : categoryTone(item.label)
    return <button key={item.id} className={`project-filter ${filter === item.id ? 'selected' : ''}`} data-tone={tone} style={toneStyle(tone)} aria-pressed={filter === item.id} onClick={() => onFilter(item.id)}>{item.label}<span>{item.count}</span></button>
  }
  return <section className="project-board" aria-label="项目看板">
    <div className="project-board-heading"><h2>项目筛选</h2><button className="text-button" onClick={onManage}>管理分类与字段<ArrowRight size={15}/></button></div>
    <div className="project-filter-row"><span className="project-filter-label">状态</span>{cards.slice(0, 3).map(renderFilter)}</div>
    <div className="project-filter-row"><span className="project-filter-label">品类</span>{cards.slice(3).map(renderFilter)}{cards.length === 3 && <span className="muted">暂无分类</span>}</div>
    {filter.startsWith('stage:') && <div className="project-stage-filter" data-tone={stageTone(filter.slice(6))} style={toneStyle(stageTone(filter.slice(6)))}><span>阶段：{filter.slice(6)} · 进行中</span><button className="text-button" onClick={() => onFilter('all')} aria-label="清除阶段筛选"><X size={14}/>清除筛选</button></div>}
  </section>
}
