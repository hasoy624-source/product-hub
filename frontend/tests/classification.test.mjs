import test from 'node:test'
import assert from 'node:assert/strict'
import { boardCounts, filterProjects, projectOverdue, reportCategoryId } from '../src/classification.ts'
import { previewApi, resetPreview } from '../src/preview.ts'

function storage() {
  const items = new Map()
  globalThis.localStorage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) }
  resetPreview()
}

test('project board filters overdue, active and configurable categories', () => {
  const today = '2026-09-27'
  const projects = [
    { id: 'p1', status: '正常', due_date: '2026-10-05' },
    { id: 'p2', status: '已完成', due_date: '2026-09-01' },
    { id: 'p3', status: '暂停', due_date: '2026-09-01' },
    { id: 'p4', status: '风险', due_date: '2026-10-05' },
  ]
  const tasks = [{ project_id: 'p1', status: '待办', due_date: '2026-09-26' }]
  const meta = [{ scope: 'project', entity_id: 'p1', category_id: 'project-battery' }, { scope: 'project', entity_id: 'p3', category_id: 'project-dry-burn' }]
  const categories = [{ id: 'project-battery', scope: 'project', name: '电池类', active: true, sort_order: 10 }, { id: 'project-dry-burn', scope: 'project', name: '干烧类', active: true, sort_order: 20 }]
  assert.equal(projectOverdue(projects[0], tasks, today), true)
  assert.deepEqual(filterProjects(projects, tasks, meta, 'overdue', today).map(p => p.id), ['p1', 'p3'])
  assert.deepEqual(filterProjects(projects, tasks, meta, 'active', today).map(p => p.id), ['p1', 'p4'])
  assert.deepEqual(filterProjects(projects, tasks, meta, 'project-battery', today).map(p => p.id), ['p1'])
  assert.deepEqual(boardCounts(projects, tasks, meta, categories, today).map(item => item.count), [4, 2, 2, 1, 1])
  assert.equal(reportCategoryId({ id: 'r1' }, []), 'report-product')
  assert.equal(reportCategoryId({ id: 'r1' }, [{ scope: 'report', entity_id: 'r1', category_id: 'report-market' }]), 'report-market')
})

test('preview taxonomy, custom fields and classifications persist locally', async () => {
  storage()
  const initial = await previewApi('/workspace')
  assert.equal(initial.categories.length, 6)
  const custom = await previewApi('/custom-fields', 'POST', { scope: 'project', key: 'priority', label: '优先级', kind: 'select', options: ['高', '低'], required: true, active: true, sort_order: 10 })
  assert.ok(custom.id)
  const category = await previewApi('/categories', 'POST', { scope: 'project', name: '温控类', active: true, sort_order: 40 })
  assert.ok(category.id)
  const project = initial.projects[0]
  await assert.rejects(previewApi(`/entity-meta/project/${project.id}`, 'PUT', { category_id: category.id, values: {} }), error => error.status === 422)
  const saved = await previewApi(`/entity-meta/project/${project.id}`, 'PUT', { category_id: category.id, values: { priority: '高' } })
  assert.equal(saved.category_id, category.id)
  const reloaded = await previewApi('/workspace')
  assert.equal(reloaded.entity_meta.find(item => item.entity_id === project.id).values.priority, '高')
  assert.equal(reloaded.custom_fields[0].label, '优先级')
})
