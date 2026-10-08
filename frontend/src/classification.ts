import type { Category, EntityMeta, Product, Project, Task, Report, Sale } from './types'

export const featuredProductCategories = ['配件类', '电池类', '干烧类', '雾化器', '一次性'] as const
export type ProductFilter = 'all' | string
export function filterProducts(products: Product[], filter: ProductFilter, query = '') {
  const search = query.trim().toLocaleLowerCase()
  return products.filter(product => (filter === 'all' || product.category === filter)
    && `${product.name} ${product.sku} ${product.category} ${product.owner}`.toLocaleLowerCase().includes(search))
}
export function filterSalesByProducts(sales: Sale[], products: Product[], filter: ProductFilter, month: string) {
  const ids = new Set(filterProducts(products, filter).map(product => product.id))
  return sales.filter(sale => sale.month === month && ids.has(sale.product_id))
}
export function productCategoryCards(products: Product[], sales: Sale[], month: string) {
  const categories = [...featuredProductCategories, ...new Set(products.map(product => product.category).filter(category => category && !featuredProductCategories.includes(category as typeof featuredProductCategories[number])))]
  return [{ id: 'all', label: '全部产品', count: products.length, revenue_cents: sales.filter(sale => sale.month === month).reduce((sum, sale) => sum + sale.revenue_cents, 0) },
    ...categories.map(category => ({ id: category, label: category, count: products.filter(product => product.category === category).length,
      revenue_cents: filterSalesByProducts(sales, products, category, month).reduce((sum, sale) => sum + sale.revenue_cents, 0) }))]
}

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
  return !['已完成', '已终止'].includes(project.status) && (Boolean(project.due_date) && project.due_date < today || tasks.some(task => task.project_id === project.id && task.status !== '已完成' && Boolean(task.due_date) && task.due_date < today))
}
export function projectProgressText(project: Project) {
  return (project.profile?.progress_known ?? project.import_info?.progress_known) === false ? '未录入' : `${project.progress}%`
}
export function searchProjects(projects: Project[], query: string) {
  const text = query.trim().toLocaleLowerCase()
  return projects.filter(project => `${project.name} ${project.owner} ${project.stage} ${project.profile?.structural_owner || ''} ${project.profile?.phase || project.import_info?.phase || ''} ${project.profile?.priority || project.import_info?.priority || ''} ${project.import_info?.category || ''}`.toLocaleLowerCase().includes(text))
}
export function projectInProgress(project: Project) {
  return project.status === '正常' || project.status === '风险'
}
export function filterProjects(projects: Project[], tasks: Task[], meta: EntityMeta[], filter: ProjectFilter, today: string) {
  if (filter === 'all') return projects
  if (filter === 'overdue') return projects.filter(project => projectOverdue(project, tasks, today))
  if (filter === 'active') return projects.filter(projectInProgress)
  if (filter === 'attention:tasks') return projects.filter(project=>tasks.some(task=>task.project_id===project.id&&task.status!=='已完成'&&Boolean(task.due_date)&&task.due_date<today))
  if (filter === 'attention:projects') return projects.filter(project=>project.status==='风险'||tasks.some(task=>task.project_id===project.id&&task.status!=='已完成'&&Boolean(task.due_date)&&task.due_date<today))
  if (filter.startsWith('status:')) return projects.filter(project => project.status === filter.slice(7))
  if (filter.startsWith('stage:')) return projects.filter(project => project.stage === filter.slice(6) && projectInProgress(project))
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
