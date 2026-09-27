import type { Category, EntityMeta, Project, Task, Report } from './types'

export const defaultCategories: Category[] = [
  { id: 'project-battery', scope: 'project', name: '电池类', active: true, sort_order: 10 },
  { id: 'project-dry-burn', scope: 'project', name: '干烧类', active: true, sort_order: 20 },
  { id: 'project-accessory', scope: 'project', name: '配件类', active: true, sort_order: 30 },
  { id: 'report-market', scope: 'report', name: '市场类型报告', active: true, sort_order: 10 },
  { id: 'report-research', scope: 'report', name: '研发类型报告', active: true, sort_order: 20 },
  { id: 'report-product', scope: 'report', name: '产品类型报告', active: true, sort_order: 30 },
]

export type ProjectFilter = 'all' | 'overdue' | 'active' | string
export function projectCategoryId(project: Project, meta: EntityMeta[]) {
  return meta.find(row => row.scope === 'project' && row.entity_id === project.id)?.category_id || ''
}
export function reportCategoryId(report: Report, meta: EntityMeta[]) {
  return meta.find(row => row.scope === 'report' && row.entity_id === report.id)?.category_id || 'report-product'
}
export function projectOverdue(project: Project, tasks: Task[], today: string) {
  return project.status !== '已完成' && (project.due_date < today || tasks.some(task => task.project_id === project.id && task.status !== '已完成' && task.due_date < today))
}
export function projectInProgress(project: Project) {
  return project.status === '正常' || project.status === '风险'
}
export function filterProjects(projects: Project[], tasks: Task[], meta: EntityMeta[], filter: ProjectFilter, today: string) {
  if (filter === 'all') return projects
  if (filter === 'overdue') return projects.filter(project => projectOverdue(project, tasks, today))
  if (filter === 'active') return projects.filter(projectInProgress)
  return projects.filter(project => projectCategoryId(project, meta) === filter)
}
export function boardCounts(projects: Project[], tasks: Task[], meta: EntityMeta[], categories: Category[], today: string) {
  return [
    { id: 'all', label: '全部项目', count: projects.length },
    { id: 'overdue', label: '已逾期', count: projects.filter(project => projectOverdue(project, tasks, today)).length },
    { id: 'active', label: '进行中', count: projects.filter(projectInProgress).length },
    ...categories.filter(category => category.scope === 'project' && (category.active || projects.some(project => projectCategoryId(project, meta) === category.id)))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map(category => ({ id: category.id, label: category.name, count: projects.filter(project => projectCategoryId(project, meta) === category.id).length })),
  ]
}
