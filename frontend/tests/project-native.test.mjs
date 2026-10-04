import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { previewApi, resetPreview } from '../src/preview.ts'
import { emptyProfile, emptyMilestone, projectBody, validateMilestone, displayProjectText } from '../src/project-native.ts'
import { projectProgressText, searchProjects } from '../src/classification.ts'

const initialize = () => { const values = new Map(); globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) }; resetPreview(); return values }
test('business text removes sheet-like blank spacing only in presentation and date inputs handle input events', () => {
  const original = '立    项：2026.10.04               结构设计：2026.10.05\n\n\t\t\n'
  assert.equal(displayProjectText(original), '立 项：2026.10.04\n结构设计：2026.10.05')
  assert.ok(original.includes('               '))
  const ui = readFileSync(new URL('../src/ProjectWorkspace.tsx', import.meta.url),'utf8')
  assert.ok(ui.includes("onInput={type === 'date'"))
  assert.ok(ui.includes('native-prose-clamped') && ui.includes('展开全部'))
})
test('project form builds native profile without fake progress or import fields', () => {
  const body = projectBody({ name: '新品', progress: '', phase: '试产', priority: 'S+', target: '项目目标', import_info: { file: 'old.xlsx' } })
  assert.equal('progress' in body, false)
  assert.equal('import_info' in body, false)
  assert.equal(body.profile.priority, 'S+')
  assert.equal(body.profile.target, '项目目标')
  assert.equal(body.profile.phase, '试产')
  assert.equal(projectBody({ name:'零进度', progress: 0 }).progress, 0)
})
test('native milestones validate calendar dates, ranges and explicit states', () => {
  const node = { ...emptyMilestone(), name: '结构设计', planned_start: '2026-10-04', planned_end: '2026-10-12' }
  assert.deepEqual(validateMilestone(node), node)
  assert.throws(() => validateMilestone({ ...node, actual_start: '2026-02-30' }))
  assert.throws(() => validateMilestone({ ...node, planned_end: '2026-10-01' }))
  assert.throws(() => validateMilestone({ ...node, status: '不存在' }))
})
test('native profile drives progress and project search independently of source records', () => {
  const project = { id: '1', name: '新品', owner: '林工', stage: 'EVT', progress: 0, profile: { ...emptyProfile(), phase: '模具制作', priority: 'S+', structural_owner: '王工' } }
  assert.equal(projectProgressText(project), '未录入')
  assert.equal(projectProgressText({ ...project, profile: { ...project.profile, progress_known: true } }), '0%')
  for (const query of ['模具制作', 's+', '王工']) assert.equal(searchProjects([project], query).length, 1)
})
test('manual preview projects support native records, editing and persisted retrieval', async () => {
  initialize()
  const project = await previewApi('/projects', 'POST', projectBody({ name:'正式项目', stage:'概念与启动', owner:'林工', due_date:'', status:'正常', progress:'', target:'项目目标', phase:'预研' }))
  const path = `/projects/${project.id}`
  assert.equal((await previewApi(`${path}/details`)).profile.progress_known, false)
  assert.equal((await previewApi(`${path}/milestone-template`, 'POST')).added, 13)
  assert.equal((await previewApi(`${path}/milestone-template`, 'POST')).added, 0)
  let data = await previewApi(`${path}/details`)
  await previewApi(`${path}/milestones/${data.milestones[0].id}`, 'PATCH', { status:'进行中', planned_start:'2026-10-04' })
  const entry = await previewApi(`${path}/updates`, 'POST', { content:'评审通过\n进入设计', kind:'关键节点', occurred_on:'2026-10-04' })
  await previewApi(`${path}/updates/${entry.id}`, 'PATCH', { content:'评审待补充' })
  await previewApi(`${path}/profile`, 'PATCH', { risk_note:'供应商待确认' })
  await previewApi(path, 'PATCH', { progress:0, profile:{ priority:'S+' } })
  data = await previewApi(`${path}/details`)
  assert.equal(data.profile.target, '项目目标')
  assert.equal(data.profile.risk_note, '供应商待确认')
  assert.equal(data.profile.progress_known, true)
  assert.equal(data.milestones[0].status, '进行中')
  assert.ok(data.updates.some(item => item.content === '评审待补充'))
  await assert.rejects(() => previewApi(`${path}/milestones/not-found`, 'PATCH', {name:'不改'}))
})
test('project business interface has no source-sheet inspector or spreadsheet endpoint', () => {
  const ui = readFileSync(new URL('../src/ProjectWorkspace.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.equal(existsSync(new URL('../src/ProjectExcelDetails.tsx', import.meta.url)), false)
  for (const text of ['原表资料','原始单元格','project-sources','ProjectExcelDetails']) { assert.equal(ui.includes(text),false); assert.equal(app.includes(text),false) }
  for (const text of ['概况','节点计划','问题与任务','项目动态','aria-selected','role="tabpanel"']) assert.ok(ui.includes(text))
  assert.ok(app.includes('setSelectedProject(saved.id)'))
})
