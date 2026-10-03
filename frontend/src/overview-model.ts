import { projectInProgress } from './classification.ts'
import { exceptionDetails } from './exceptions.ts'
import type { Stage } from './knowledge-catalog'
import type { Workspace } from './types'

export const workflowStages: { id: Stage; title: string; subtitle: string }[] = [
  { id: '概念与启动', title: '概念与启动', subtitle: '需求 · 立项' },
  { id: '设计与开发', title: '设计与开发', subtitle: '设计 · 样机' },
  { id: 'EVT', title: '工程验证', subtitle: 'EVT' },
  { id: 'DVT', title: '设计验证', subtitle: 'DVT' },
  { id: 'MP', title: '量产', subtitle: 'MP' },
]

export function daysOverdue(dueDate: string, today: string) {
  const difference = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)
  return Number.isFinite(difference) ? Math.max(0, Math.floor(difference / 86_400_000)) : 0
}

export function operationalOverview(workspace: Workspace, today: string) {
  const exceptions = exceptionDetails(workspace, today)
  const active = workspace.projects.filter(projectInProgress)
  const focus = [
    ...exceptions.tasks.map(task => ({
      id: `task:${task.id}`, kind: 'task' as const, title: task.title, projectId: task.project_id,
      context: workspace.projects.find(project => project.id === task.project_id)?.name || '未关联项目',
      owner: task.owner || '待指定', dueDate: task.due_date, overdueDays: daysOverdue(task.due_date, today),
    })),
    ...exceptions.projects.map(project => ({
      id: `project:${project.id}`, kind: 'project' as const, title: project.name, projectId: project.id,
      context: `${project.stage} · 项目风险`, owner: project.owner || '待指定',
      dueDate: project.due_date, overdueDays: daysOverdue(project.due_date, today),
    })),
  ]
  return {
    exceptions, focus, activeCount: active.length,
    openTaskCount: workspace.tasks.filter(task => task.status !== '已完成').length,
    reviewDocumentCount: (workspace.knowledge_documents || []).filter(doc => doc.status === '待评审').length,
    stages: workflowStages.map(stage => {
      const projects = active.filter(project => project.stage === stage.id)
      return { ...stage, count: projects.length, riskCount: projects.filter(project => project.status === '风险').length }
    }),
    projects: [...active].sort((a, b) => Number(b.status === '风险') - Number(a.status === '风险') || a.due_date.localeCompare(b.due_date)).slice(0, 3),
    signals: [...workspace.signals].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on)).slice(0, 2),
    reports: [...workspace.reports].sort((a, b) => b.generated_at.localeCompare(a.generated_at)).slice(0, 2),
  }
}
