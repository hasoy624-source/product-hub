import test from 'node:test'
import assert from 'node:assert/strict'
import { knowledgeTemplates, stages, starterDocument } from '../src/knowledge-catalog.ts'
import { previewApi, resetPreview } from '../src/preview.ts'

test('five-stage process catalog maps outputs and four gates to document templates', () => {
  assert.equal(stages.length, 5)
  assert.ok(knowledgeTemplates.length >= 50)
  assert.equal(new Set(knowledgeTemplates.map(item => item.id)).size, knowledgeTemplates.length)
  for (const stage of stages) assert.ok(knowledgeTemplates.some(item => item.stage === stage))
  for (const gate of ['Gate 1', 'Gate 2', 'Gate 3', 'Gate 4']) assert.ok(knowledgeTemplates.some(item => item.gate === gate))
  for (const item of knowledgeTemplates) {
    assert.ok(item.activity && item.title && item.owner && item.inputs && item.focus)
    const content = starterDocument(item, '测试项目')
    assert.match(content, new RegExp(item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(content, /测试项目/)
  }
  assert.match(starterDocument(knowledgeTemplates.find(item => item.id === 'e-t1-test')), /测试范围与结果/)
  assert.match(starterDocument(knowledgeTemplates.find(item => item.id === 'd-wbs')), /里程碑与任务/)
  assert.match(starterDocument(knowledgeTemplates.find(item => item.id === 'c-gate1')), /评审议题与决议/)
})

test('local preview document writes persist by project and template', async () => {
  const storage = new Map()
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
  resetPreview()
  const initial = await previewApi('/workspace')
  assert.deepEqual(initial.knowledge_documents, [])
  const body = { project_id: initial.projects[0].id, template_id: 'e-t1-test', stage: 'EVT', title: 'T1测试报告', owner: '测试', status: '草稿', content: '# 测试报告' }
  const created = await previewApi('/knowledge_documents', 'POST', body)
  assert.ok(created.id && created.updated_at)
  await assert.rejects(previewApi('/knowledge_documents', 'POST', body), error => error.status === 409)
  const updated = await previewApi(`/knowledge_documents/${created.id}`, 'PATCH', { content: '# 已更新', status: '待评审' })
  assert.equal(updated.status, '待评审')
  const reloaded = await previewApi('/workspace')
  assert.equal(reloaded.knowledge_documents[0].content, '# 已更新')
})
