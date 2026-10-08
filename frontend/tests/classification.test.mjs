import test from 'node:test'
import assert from 'node:assert/strict'
import { boardCounts, filterProducts, filterProjects, filterSalesByProducts, productCategoryCards, projectOverdue, reportCategoryId } from '../src/classification.ts'
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
  assert.deepEqual(filterProjects([{ id: 's1', stage: 'EVT', status: '正常', due_date: '2026-10-05' }, { id: 's2', stage: 'MP', status: '正常', due_date: '2026-10-05' }], [], [], 'stage:EVT', today).map(p => p.id), ['s1'])
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

test('product category cards filter product records and monthly sales together', () => {
  const products = [
    { id: 'a', name: '充电底座', sku: 'A-01', category: '配件类', owner: '林' },
    { id: 'b', name: '电池包', sku: 'B-01', category: '电池类', owner: '陈' },
    { id: 'c', name: '防干烧芯', sku: 'C-01', category: '干烧类', owner: '周' },
    { id: 'd', name: '新品', sku: 'D-01', category: '自定义类', owner: '苏' },
  ]
  const sales = [
    { id: 's1', product_id: 'a', month: '2026-09', revenue_cents: 10000 },
    { id: 's2', product_id: 'b', month: '2026-09', revenue_cents: 20000 },
    { id: 's3', product_id: 'b', month: '2026-08', revenue_cents: 90000 },
    { id: 's4', product_id: 'c', month: '2026-09', revenue_cents: 30000 },
  ]
  assert.deepEqual(productCategoryCards(products, sales, '2026-09').map(card => [card.label, card.count, card.revenue_cents]), [
    ['全部产品', 4, 60000], ['电池类', 1, 20000], ['配件类', 1, 10000], ['干烧类', 1, 30000], ['雾化器', 0, 0], ['一次性', 0, 0], ['自定义类', 1, 0],
  ])
  assert.deepEqual(filterProducts(products, '电池类', ' b-01 ').map(product => product.id), ['b'])
  assert.deepEqual(filterSalesByProducts(sales, products, '电池类', '2026-09').map(sale => sale.id), ['s2'])
  assert.deepEqual(filterProducts(products, 'all').map(product => product.id), ['a', 'b', 'c', 'd'])
})

test('new and existing demo previews retain visible product category examples', async () => {
  const items = new Map()
  globalThis.localStorage = { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) }
  resetPreview()
  const fresh = await previewApi('/workspace')
  assert.deepEqual(productCategoryCards(fresh.products, fresh.sales, fresh.sales[0].month).slice(0, 4).map(card => card.count), [5, 2, 2, 1])
  const key = [...items.keys()][0]
  const old = structuredClone(fresh)
  old.products[0].category = '智能健康'
  old.products[1].category = '运动恢复'
  old.products[2].category = '智能家居'
  old.products[3].category = '智能健康'
  old.products[4].category = '生活方式'
  items.set(key, JSON.stringify(old))
  const migrated = await previewApi('/workspace')
  assert.deepEqual(migrated.products.map(product => product.category), fresh.products.map(product => product.category))
})
