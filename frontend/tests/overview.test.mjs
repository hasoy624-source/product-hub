import test from 'node:test'
import assert from 'node:assert/strict'
import { operationalOverview, daysOverdue, workflowStages } from '../src/overview-model.ts'
import { filterProjects } from '../src/classification.ts'

const empty = () => ({ products: [], sales: [], projects: [], tasks: [], signals: [], reports: [], knowledge_documents: [] })

test('operational priorities show oldest overdue tasks then risk projects with actionable context', () => {
  const workspace = { ...empty(),
    projects: [
      { id: 'p1', name: '电池验证', owner: '陈', stage: 'EVT', status: '风险', due_date: '2026-10-12' },
      { id: 'p2', name: '配件设计', owner: '林', stage: '设计与开发', status: '正常', due_date: '2026-10-20' },
    ],
    tasks: [
      { id: 'new', title: '样机验收', project_id: 'p1', owner: '陈', due_date: '2026-10-02', status: '进行中' },
      { id: 'old', title: '结构评审', project_id: 'p2', owner: '林', due_date: '2026-09-30', status: '待办' },
      { id: 'done', project_id: 'p1', due_date: '2026-09-01', status: '已完成' },
      { id: 'today', project_id: 'p2', due_date: '2026-10-04', status: '待办' },
    ],
  }
  const original = structuredClone(workspace)
  const result = operationalOverview(workspace, '2026-10-04')
  assert.deepEqual(result.focus.map(item => item.id), ['task:old', 'task:new', 'project:p1'])
  assert.equal(result.focus[0].context, '配件设计')
  assert.equal(result.focus[0].owner, '林')
  assert.equal(result.focus[0].projectId, 'p2')
  assert.equal(result.focus[0].overdueDays, 4)
  assert.equal(result.openTaskCount, 3)
  assert.equal(result.activeCount, 2)
  assert.deepEqual(workspace, original)
})

test('stage counts match drill-down filters and exclude paused or completed projects', () => {
  const workspace = { ...empty(), projects: [
    { id: 'risk', status: '风险', stage: 'EVT', due_date: '2026-10-20' },
    { id: 'normal', status: '正常', stage: 'EVT', due_date: '2026-10-05' },
    { id: 'done', status: '已完成', stage: 'EVT', due_date: '2026-10-01' },
    { id: 'paused', status: '暂停', stage: 'EVT', due_date: '2026-10-01' },
    { id: 'concept', status: '正常', stage: '概念与启动', due_date: '2026-10-10' },
  ] }
  const result = operationalOverview(workspace, '2026-10-04')
  assert.deepEqual(result.stages.map(stage => stage.count), [1, 0, 2, 0, 0])
  assert.equal(result.stages[2].riskCount, 1)
  assert.deepEqual(result.projects.map(project => project.id), ['risk', 'normal', 'concept'])
  for (const stage of result.stages) {
    assert.equal(filterProjects(workspace.projects, [], [], `stage:${stage.id}`, '2026-10-04').length, stage.count)
  }
  assert.deepEqual(workflowStages.map(stage => stage.id), ['概念与启动', '设计与开发', 'EVT', 'DVT', 'MP'])
})

test('document review and recent intelligence are derived without changing source order', () => {
  const workspace = { ...empty(),
    knowledge_documents: [{ status: '待评审' }, { status: '草稿' }, { status: '已归档' }, { status: '待评审' }],
    signals: [{ id: 'old', occurred_on: '2026-09-01' }, { id: 'new', occurred_on: '2026-10-03', sentiment: '负向' }],
    reports: [{ id: 'old', generated_at: '2026-09-01T01:00:00Z' }, { id: 'new', generated_at: '2026-10-03T01:00:00Z' }],
  }
  const original = structuredClone(workspace)
  const result = operationalOverview(workspace, '2026-10-04')
  assert.equal(result.reviewDocumentCount, 2)
  assert.deepEqual(result.signals.map(signal => signal.id), ['new', 'old'])
  assert.deepEqual(result.reports.map(report => report.id), ['new', 'old'])
  assert.equal(result.exceptions.total, 1)
  assert.deepEqual(workspace, original)
})

test('empty workspaces and due-date boundaries do not create false priorities', () => {
  const result = operationalOverview(empty(), '2026-10-04')
  assert.equal(result.activeCount, 0)
  assert.equal(result.reviewDocumentCount, 0)
  assert.deepEqual(result.focus, [])
  assert.ok(result.stages.every(stage => stage.count === 0))
  assert.equal(daysOverdue('2026-10-04', '2026-10-04'), 0)
  assert.equal(daysOverdue('2026-10-05', '2026-10-04'), 0)
  assert.equal(daysOverdue('2026-09-30', '2026-10-04'), 4)
  assert.equal(daysOverdue('invalid', '2026-10-04'), 0)
})
