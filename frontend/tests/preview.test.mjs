import test from 'node:test'
import assert from 'node:assert/strict'
import { previewApi, resetPreview } from '../src/preview.ts'

function initializeStorage() {
  const storage = new Map()
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  resetPreview()
  return storage
}

test('preview workspace uses sample data, calculates KPIs, persists UI writes locally', async () => {
  const storage = initializeStorage()
  const health = await previewApi('/health')
  assert.equal(health.mode, 'demo')
  const workspace = await previewApi('/workspace')
  assert.equal(workspace.products.length, 5)
  assert.equal(workspace.sales.length, 18)
  assert.equal(workspace.projects.length, 5)
  assert.match(workspace.products[0].description, /虚构/)
  const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()).slice(0, 7)
  const dashboard = await previewApi(`/dashboard?month=${currentMonth}`)
  assert.equal(dashboard.product_count, 5)
  assert.equal(dashboard.trend.length, 6)
  assert.equal(dashboard.top_product_share > 60, true)
  const product = await previewApi('/products', 'POST', { name: '本机临时产品', sku: 'QA-1', category: '测试', owner: '测试' })
  assert.equal((await previewApi('/workspace')).products.some(item => item.id === product.id), true)
  assert.ok(storage.size > 0)
})

test('preview sales reject duplicates; reports and jobs work without a server', async () => {
  initializeStorage()
  const workspace = await previewApi('/workspace')
  const sale = workspace.sales[0]
  await assert.rejects(() => previewApi('/sales', 'POST', sale), { status: 409 })
  const report = await previewApi('/reports/generate', 'POST', { month: sale.month })
  assert.equal(report.source, '规则汇总')
  assert.match(report.content, /虚构/)
  const result = await previewApi('/jobs/demo-job-1/run', 'POST', {})
  assert.equal(result.job_id, 'demo-job-1')
  const final = await previewApi('/workspace')
  assert.equal(final.reports.length, 3)
  assert.ok(final.jobs[0].last_run_at)
})
