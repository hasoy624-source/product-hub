import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { filterGuideTopics, guideHrefFor, guideTopicForRoute, guideTopics, isGuideRoute } from '../src/guide-catalog.ts'

test('usage guide covers all nine business boards with detailed steps and questions', () => {
  const destinations = ['overview', 'exceptions', 'projects', 'products', 'signals', 'knowledge', 'reports', 'integrations', 'settings']
  assert.equal(guideTopics.length, 12)
  assert.equal(new Set(guideTopics.map(topic => topic.id)).size, 12)
  assert.deepEqual(guideTopics.filter(topic => topic.destination).map(topic => topic.destination).sort(), destinations.sort())
  for (const topic of guideTopics) {
    assert.ok(topic.summary.length > 30)
    assert.ok(topic.sections.length > 0 && topic.questions.length > 0)
    assert.ok(JSON.stringify(topic.sections).length > 200)
  }
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  for (const id of destinations) assert.ok(app.includes(`id: '${id}'`))
})

test('guide deep links, contextual help links and content search are stable', () => {
  assert.equal(isGuideRoute('guide'), true)
  assert.equal(guideTopicForRoute('guide').id, 'start')
  for (const topic of guideTopics) {
    const route = `guide/${topic.id}`
    assert.equal(isGuideRoute(route), true)
    assert.equal(guideTopicForRoute(route).id, topic.id)
    if (topic.destination) assert.equal(guideHrefFor(topic.destination), `#${route}`)
  }
  assert.equal(guideHrefFor('exceptions/tasks'), '#guide/exceptions')
  assert.equal(guideHrefFor('unknown'), '#guide')
  assert.equal(isGuideRoute('guide/unknown'), false)
  assert.equal(isGuideRoute('guide/projects/extra'), false)
  assert.equal(isGuideRoute('guide/projects?redirect=other'), false)
  assert.equal(filterGuideTopics(' ').length, 12)
  assert.ok(filterGuideTopics('  SKU  ').some(topic => topic.id === 'products'))
  assert.ok(filterGuideTopics('100,000').some(topic => topic.id === 'knowledge'))
  assert.deepEqual(filterGuideTopics('没有这个关键词xyz'), [])
})

test('guide explains actual preview limitations, manual stages and filtering scopes', () => {
  const text = id => JSON.stringify(guideTopics.find(topic => topic.id === id))
  assert.ok(text('reports').includes('浏览器演示没有后台调度进程'))
  assert.ok(text('reports').includes('不使用上方另外选中的历史月份'))
  assert.ok(text('reports').includes('顶部月份不隐藏其他月份'))
  assert.ok(text('products').includes('搜索只查找产品档案'))
  assert.ok(text('settings').includes('产品类别不在这里配置'))
  assert.ok(text('projects').includes('任务完成不会自动推进阶段'))
  assert.ok(text('data').includes('不同设备、浏览器或浏览器配置文件不共享'))
  assert.ok(text('integrations').includes('不填写 API Key'))
})

test('business explanatory copy is removed while guide remains independent of workspace loading', () => {
  const src = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
  const app = src('App.tsx')
  assert.ok(!app.includes('pageDescriptions') && !app.includes('page-description'))
  assert.ok(!app.includes('关注异常，推进项目，掌握经营表现。'))
  assert.ok(!app.includes('净销售额以元输入，以整数分保存'))
  assert.ok(app.includes('isGuideRoute(route) ? <UsageGuide'))
  assert.ok(app.includes('guideHrefFor(route)'))
  const overview = src('OperationalOverview.tsx')
  for (const copy of ['按阶段查看项目，接着处理任务与输出文档。', '逾期与风险优先，进入项目继续处理。', '点击饼图或分类，查看对应明细']) assert.ok(!overview.includes(copy))
  assert.ok(overview.includes('所选月净销售额 · CNY'))
  assert.ok(!src('ExceptionCenter.tsx').includes('{group.description}'))
  assert.ok(!src('KnowledgeBase.tsx').includes('填写后保存为当前项目的文档'))
  assert.ok(src('UsageGuide.tsx').includes('aria-current'))
  assert.ok(src('UsageGuide.tsx').includes('选择说明章节'))
})
