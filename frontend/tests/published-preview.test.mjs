import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import snapshot from '../src/data/published-projects.json' with { type: 'json' }
import { publishedWorkspace, publishedStorageKey } from '../src/published-preview.ts'
import { projectProgressText } from '../src/classification.ts'

test('published project snapshot includes all native projects and related records without demo rows', () => {
  const workspace = publishedWorkspace(snapshot, '/product-hub/')
  assert.equal(workspace.projects.length, snapshot.counts.projects)
  assert.equal(workspace.tasks.length, snapshot.counts.tasks)
  const details = Object.values(workspace.project_details)
  for (const key of ['milestones', 'updates', 'images']) assert.equal(details.reduce((n, d) => n + d[key].length, 0), snapshot.counts[key])
  const ids = new Set(workspace.projects.map(p => p.id))
  assert.equal(ids.size, snapshot.counts.projects)
  assert.ok(workspace.tasks.every(t => ids.has(t.project_id)))
  assert.ok(workspace.projects.every(p => !p.id.startsWith('demo-') && !('import_info' in p)))
  assert.equal(workspace.sales.length, 0)
  assert.equal(workspace.signals.length, 0)
  assert.equal(workspace.reports.length, 0)
})

test('published original image files match hashes and resolve under the Pages base path', () => {
  const workspace = publishedWorkspace(snapshot, '/product-hub/')
  for (const detail of Object.values(workspace.project_details)) for (const image of detail.images) {
    assert.equal(image.url, '/product-hub/project-assets/' + image.filename)
    assert.equal(image.url.startsWith('/api/'), false)
  }
  assert.equal(Object.keys(snapshot.image_hashes).length, snapshot.counts.image_files)
  for (const [name, hash] of Object.entries(snapshot.image_hashes)) {
    const content = readFileSync(new URL('../public/project-assets/' + name, import.meta.url))
    assert.equal(createHash('sha256').update(content).digest('hex'), hash)
  }
})

test('published workspaces retain native values and local edits do not mutate the release seed', () => {
  const first = publishedWorkspace(snapshot, '/')
  assert.deepEqual(first.projects, snapshot.workspace.projects)
  const unknown = first.projects.find(p => !p.profile.progress_known)
  if (unknown) assert.equal(projectProgressText(unknown), '未录入')
  first.projects[0].name = '临时编辑'
  first.project_details[first.projects[0].id].profile.target = '临时目标'
  assert.notEqual(publishedWorkspace(snapshot).projects[0].name, '临时编辑')
  assert.notEqual(publishedWorkspace(snapshot).project_details[first.projects[0].id].profile.target, '临时目标')
})

test('revision storage avoids old five-project caches without deleting prior browser edits', () => {
  const prior = 'zhixu-public-preview-v1'
  const current = publishedStorageKey(snapshot.revision)
  assert.notEqual(current, prior)
  assert.notEqual(current, publishedStorageKey('next-revision'))
  const storage = new Map([[prior, 'old-user-edits'], [current, JSON.stringify(publishedWorkspace(snapshot))]])
  assert.equal(storage.get(prior), 'old-user-edits')
  assert.equal(JSON.parse(storage.get(current)).projects.length, snapshot.counts.projects)
  const api = readFileSync(new URL('../src/preview.ts', import.meta.url), 'utf8')
  assert.ok(api.includes('publishedStorageKey(snapshot.revision)'))
  assert.ok(api.includes('return publishedWorkspace(snapshot, import.meta.env.BASE_URL)'))
})

test('public snapshot exports business records, not workbook provenance or credentials', () => {
  assert.deepEqual(Object.keys(snapshot).sort(), ['counts','image_hashes','revision','schema_version','workspace'])
  const workspace = snapshot.workspace
  for (const field of ['sessions', 'project_sources', 'raw_rows', 'token_hash', 'DATABASE_URL']) assert.equal(field in workspace, false)
  for (const project of workspace.projects) assert.equal('import_info' in project, false)
  for (const meta of workspace.entity_meta) assert.equal(typeof meta.values, 'object')
  for (const field of workspace.custom_fields) assert.ok(Array.isArray(field.options))
})
