import test from 'node:test'
import assert from 'node:assert/strict'
import { exceptionDetails } from '../src/exceptions.ts'

test('exception overview and detail pages share the same actionable records', () => {
  const workspace = {
    tasks: [
      { id: 'late', project_id: 'p1', due_date: '2026-09-26', status: '待办' },
      { id: 'done', project_id: 'p1', due_date: '2026-09-20', status: '已完成' },
      { id: 'today', project_id: 'p2', due_date: '2026-09-27', status: '进行中' },
    ],
    projects: [{ id: 'p1', due_date: '2026-10-01', status: '风险' }, { id: 'p2', due_date: '2026-09-20', status: '正常' }],
    signals: [{ id: 's1', sentiment: '负向', occurred_on: '2026-09-25' }, { id: 's2', sentiment: '正向', occurred_on: '2026-09-26' }],
  }
  const result = exceptionDetails(workspace, '2026-09-27')
  assert.equal(result.total, 3)
  assert.deepEqual(result.groups.map(group => [group.id, group.count]), [['tasks', 1], ['projects', 1], ['signals', 1]])
  assert.deepEqual(result.tasks.map(item => item.id), ['late'])
  assert.deepEqual(result.projects.map(item => item.id), ['p1'])
  assert.deepEqual(result.signals.map(item => item.id), ['s1'])
})

test('empty exceptions produce a zero-total dashboard without false positives', () => {
  const result = exceptionDetails({ tasks: [], projects: [], signals: [] }, '2026-09-27')
  assert.equal(result.total, 0)
  assert.deepEqual(result.groups.map(group => group.count), [0, 0, 0])
})
