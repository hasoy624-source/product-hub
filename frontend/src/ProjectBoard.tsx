import { AlertCircle, ArrowRight, CirclePlay, Layers3 } from 'lucide-react'
import { boardCounts } from './classification'
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
  return <section className="project-board" aria-label="项目看板">
    <div className="project-board-heading"><h2>项目看板</h2><button className="text-button" onClick={onManage}>管理分类与字段<ArrowRight size={15}/></button></div>
    <div className="project-board-cards">{cards.map((item, index) => <button key={item.id} className={`project-board-card ${filter === item.id ? 'selected' : ''}`} aria-pressed={filter === item.id} onClick={() => onFilter(item.id)}><span>{index === 1 ? <AlertCircle size={16}/> : index === 2 ? <CirclePlay size={16}/> : <Layers3 size={16}/>} {item.label}</span><strong>{item.count}</strong><small>{index <= 2 ? '项目状态' : '产品品类'}</small></button>)}</div>
  </section>
}
