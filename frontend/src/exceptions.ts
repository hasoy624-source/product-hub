import type { Project, Signal, Task, Workspace } from './types'
import { semanticPalette } from './semantics.ts'

export type ExceptionView = 'tasks' | 'projects' | 'signals'
export type ExceptionGroup = { id: ExceptionView; label: string; count: number; color: string; description: string }

export function exceptionDetails(workspace: Workspace, today: string): {
  tasks: Task[]
  projects: Project[]
  signals: Signal[]
  groups: ExceptionGroup[]
  total: number
} {
  const tasks = workspace.tasks.filter(task => task.status !== '已完成' && task.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const projects = workspace.projects.filter(project => project.status === '风险')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  const signals = workspace.signals.filter(signal => signal.sentiment === '负向')
    .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))
  const groups: ExceptionGroup[] = [
    { id: 'tasks', label: '逾期任务', count: tasks.length, color: semanticPalette.red.solid, description: '截止日期已过且尚未完成' },
    { id: 'projects', label: '风险项目', count: projects.length, color: semanticPalette.amber.solid, description: '项目状态被标记为风险' },
    { id: 'signals', label: '负向反馈', count: signals.length, color: semanticPalette.rose.solid, description: '市场情报中的负向记录' },
  ]
  return { tasks, projects, signals, groups, total: tasks.length + projects.length + signals.length }
}
