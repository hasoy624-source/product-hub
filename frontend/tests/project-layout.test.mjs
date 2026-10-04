import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
const css = source('styles.css').split('/* Project master/detail workspace:')[1]

test('project master/detail frame constrains both columns and owns separate scroll bodies', () => {
  assert.match(css, /\.project-layout\.project-workbench\{[^}]*min-height:0[^}]*overflow:hidden[^}]*align-items:stretch/)
  assert.match(css, /\.project-workbench \.project-navigator\{[^}]*position:static[^}]*align-self:stretch[^}]*overflow:hidden/)
  assert.match(css, /\.project-list-scroll\{[^}]*overflow-y:auto[^}]*overscroll-behavior:contain/)
  assert.match(css, /\.project-workbench \.native-panel\{[^}]*overflow-y:auto[^}]*overscroll-behavior:contain/)
  assert.match(css, /\.project-workbench \.native-project-header\{[^}]*flex:0 0 auto/)
  assert.match(css, /\.project-workbench \.native-tabs\{[^}]*flex:0 0 auto/)
})
test('uniform project rows retain semantic stages without redundant unknown-progress bars', () => {
  const nav = source('ProjectNavigator.tsx')
  assert.match(css, /\.project-workbench \.project-list-row\{[^}]*height:78px;min-height:78px/)
  for (const text of ['aria-current', 'kind="stage"', 'kind="status"', 'title={project.name}', 'tabIndex={0}', '重置筛选与搜索']) assert.ok(nav.includes(text))
  assert.equal(nav.includes('progress-track'), false)
  assert.equal(nav.includes('project.progress'), false)
})
test('project overview foregrounds actionable work and preserves full records and stable tab navigation', () => {
  const ui = source('ProjectWorkspace.tsx')
  assert.ok(ui.indexOf('native-focus-work') < ui.indexOf('native-overview-aside'))
  assert.ok(ui.includes('native-prose-clamped') && ui.includes('展开全部'))
  assert.ok(ui.includes('panel.current?.scrollTo({ top: 0 })'))
  assert.ok(ui.includes('focus({ preventScroll: true })'))
  assert.equal(ui.includes("setData(null); setError('')"), false)
  assert.equal(ui.includes('data-step='), false) // Broad stage does not assert a node was completed.
})
test('narrow screens expose a master/detail back path and filters preserve custom categories', () => {
  const app = source('App.tsx'), board = source('ProjectBoard.tsx')
  assert.match(css, /@media\(max-width:900px\)/)
  for (const text of ['show-project-detail', 'project-mobile-back', 'display:none']) assert.ok(css.includes(text))
  assert.ok(app.includes('onBack={() => setProjectMobileDetail(false)}'))
  assert.ok(app.includes('setSelectedProject(saved.id); setProjectMobileDetail(true)'))
  for (const text of ['项目状态筛选', '项目品类筛选', 'categoryCards.map', '管理分类与字段']) assert.ok(board.includes(text))
})
