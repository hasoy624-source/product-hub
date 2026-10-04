import { Search } from 'lucide-react'
import SemanticTag from './SemanticTag'
import type { Project } from './types'

export default function ProjectNavigator({ projects, total, selectedId, query, onQuery, onSelect, onReset }: { projects: Project[]; total: number; selectedId?: string; query: string; onQuery: (value: string) => void; onSelect: (id: string) => void; onReset: () => void }) {
  return <section className="project-list project-navigator" aria-label="项目列表">
    <header className="project-navigator-head"><div><h2>项目列表</h2><span>{projects.length} / {total}</span></div><label className="search-field"><Search size={15}/><input aria-label="搜索项目" placeholder="搜索项目、负责人、阶段" value={query} onChange={event => onQuery(event.target.value)}/></label></header>
    <div className="project-list-scroll" role="region" aria-label="滚动项目列表" tabIndex={0}>{projects.map(project => <button key={project.id} className={`project-selector project-list-row ${selectedId === project.id ? 'selected' : ''}`} aria-current={selectedId === project.id ? 'true' : undefined} onClick={() => onSelect(project.id)}><div className="project-row-title"><h3 title={project.name}>{project.name}</h3><SemanticTag kind="status" value={project.status}/></div><div className="project-row-context"><SemanticTag kind="stage" value={project.stage}/><span title={project.profile?.phase || ''}>{project.profile?.phase || project.owner || '待指定'}</span>{project.profile?.phase && <small>{project.owner || '待指定'}</small>}</div></button>)}{!projects.length && <div className="project-list-empty"><Search size={24}/><strong>暂无匹配项目</strong><button className="text-button" onClick={onReset}>重置筛选与搜索</button></div>}</div>
  </section>
}
