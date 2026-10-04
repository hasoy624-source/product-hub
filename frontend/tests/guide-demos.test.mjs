import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { guideTopics } from '../src/guide-catalog.ts'
import { completeDemoTask, createDemoWorkspace, demoMonth, demoScenarios, demoToday, recordDemoSale } from '../src/guide-demo-model.ts'
import { exceptionDetails } from '../src/exceptions.ts'
import { filterProducts, filterSalesByProducts } from '../src/classification.ts'

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')

test('all twelve guide chapters provide concrete demo instructions and an interactive scenario', () => {
  assert.deepEqual(demoScenarios.map(item => item.id), guideTopics.map(topic => topic.id))
  const demo = source('GuideDemo.tsx')
  for (const scenario of demoScenarios) {
    assert.equal(scenario.steps.length, 3)
    assert.ok(scenario.title.length > 3 && scenario.takeaway.length > 12)
    assert.ok(demo.includes(`case '${scenario.id}': return <`))
  }
  assert.ok(demo.includes('重置演示') && demo.includes('key={`${topicId}-${revision}`}'))
})

test('reset creates fresh sample records and never shares nested arrays', () => {
  const first = createDemoWorkspace(), second = createDemoWorkspace()
  assert.deepEqual(first, second)
  first.products[0].name = 'changed'
  first.tasks[0].status = '已完成'
  first.sales.push({ ...first.sales[0], id: 'another' })
  assert.equal(second.products[0].name, '示例·多功能切膏刀')
  assert.equal(second.tasks[0].status, '进行中')
  assert.equal(second.sales.length, 1)
  assert.deepEqual(second, createDemoWorkspace())
})

test('demo exceptions use business rules and completion changes the exact totals', () => {
  const original = createDemoWorkspace()
  const before = exceptionDetails(original, demoToday)
  assert.deepEqual(before.groups.map(group => group.count), [1, 1, 1])
  assert.equal(before.total, 3)
  const completed = completeDemoTask(original, 'demo-task', true)
  const after = exceptionDetails(completed, demoToday)
  assert.deepEqual(after.groups.map(group => group.count), [0, 1, 1])
  assert.equal(after.total, 2)
  assert.equal(original.tasks[0].status, '进行中')
  assert.equal(completed.projects[0].stage, 'EVT')
  assert.equal(completed.projects[0].progress, 55)
  assert.equal(completed.projects[0].status, '风险')
  assert.deepEqual(completeDemoTask(completed, 'demo-task', false), original)
})

test('demo sales preserve integer fen, category scope and original records', () => {
  const original = createDemoWorkspace()
  const saved = recordDemoSale(original, 'demo-battery', '1280.50')
  assert.equal(original.sales.length, 1)
  assert.equal(saved.sales.at(-1).revenue_cents, 128050)
  assert.equal(saved.sales.at(-1).month, demoMonth)
  assert.equal(filterProducts(saved.products, '电池类').length, 1)
  assert.equal(filterSalesByProducts(saved.sales, saved.products, '电池类', demoMonth)[0].revenue_cents, 128050)
  assert.equal(filterSalesByProducts(saved.sales, saved.products, 'all', demoMonth).reduce((sum, sale) => sum + sale.revenue_cents, 0), 164050)
  assert.equal(filterSalesByProducts(saved.sales, saved.products, 'all', '2026-09').length, 0)
})

test('invalid and duplicate demo sales do not mutate the example', () => {
  const original = createDemoWorkspace(), snapshot = structuredClone(original)
  for (const amount of ['', '-1', '1.234', 'NaN', '1e3']) assert.throws(() => recordDemoSale(original, 'demo-battery', amount))
  assert.throws(() => recordDemoSale(original, 'unknown', '1.00'), /请选择有效产品/)
  assert.throws(() => recordDemoSale(original, 'demo-accessory', '1.00'), /已有记录/)
  assert.deepEqual(original, snapshot)
  const zero = recordDemoSale(original, 'demo-battery', '0')
  assert.equal(zero.sales.at(-1).revenue_cents, 0)
  assert.throws(() => recordDemoSale(zero, 'demo-battery', '1'), /已有记录/)
})

test('demo modules are isolated from API, navigation, and persistent storage', () => {
  for (const name of ['GuideDemo.tsx', 'guide-demo-model.ts']) {
    const text = source(name)
    assert.ok(!/from\s+['"].*(?:\/api|\/preview)['"]/.test(text))
    assert.ok(!/\b(?:fetch|XMLHttpRequest|localStorage|sessionStorage|indexedDB|onNavigate)\b\s*(?:\(|\.)/.test(text))
    assert.ok(!/\bhref\s*=|window\.location|location\.hash/.test(text))
  }
  assert.ok(source('GuideDemo.tsx').includes('交互示例 · 不影响工作空间'))
})

test('reading regions support keyboard navigation and keep demos mounted when hidden', () => {
  const text = source('UsageGuide.tsx'), css = source('usage-guide.css')
  for (const role of ['tablist', 'tab', 'tabpanel']) assert.ok(text.includes(`role="${role}"`))
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.ok(text.includes(`event.key === '${key}'`))
  assert.ok(text.includes('aria-controls=') && text.includes('aria-labelledby='))
  assert.ok(text.includes('hidden={view !== 0}><GuideDemo'))
  assert.ok(text.includes('<ChapterContent key={topic.id}'))
  assert.ok(css.includes('.guide-view-panel[hidden] { display: none; }'))
  assert.ok(css.includes('@container (max-width: 590px)'))
})

test('complete text and FAQs remain reachable independently from the demo region', () => {
  const text = source('UsageGuide.tsx')
  assert.ok(text.includes('topic.sections[sectionIndex]'))
  assert.ok(text.includes('setSectionIndex(index)'))
  assert.ok(text.includes('section.paragraphs?.map') && text.includes('section.steps.map') && text.includes('section.terms.map'))
  assert.ok(text.includes('topic.questions.map') && text.includes('<summary>'))
  assert.deepEqual(guideTopics.filter(topic => topic.destination).length, 9)
  assert.ok(source('GuideDemo.tsx').includes('saved.content !== content'))
  assert.ok(source('GuideDemo.tsx').includes('savedValue === value'))
})
