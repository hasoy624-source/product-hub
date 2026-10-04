import test from 'node:test'
import assert from 'node:assert/strict'
import { categoryTone, fieldTone, semanticPalette, semanticTone, stageTone, statusTone, toneStyle } from '../src/semantics.ts'
import { workflowStages } from '../src/overview-model.ts'

test('five existing workflow stages have distinct stable colors without changing business values', () => {
  assert.deepEqual(workflowStages.map(stage => stage.id), ['概念与启动', '设计与开发', 'EVT', 'DVT', 'MP'])
  assert.deepEqual(workflowStages.map(stage => stageTone(stage.id)), ['cyan', 'blue', 'violet', 'amber', 'rose'])
  assert.equal(new Set(workflowStages.map(stage => stageTone(stage.id))).size, 5)
  assert.equal(stageTone('未定义阶段'), 'neutral')
  assert.equal(stageTone(''), 'neutral')
  assert.equal(stageTone('constructor'), 'neutral')
  assert.equal(stageTone('__proto__'), 'neutral')
  assert.equal(fieldTone('stage', 'EVT'), semanticTone('stage', 'EVT'))
})

test('category, report and signal colors are consistent across filters, lists and custom labels', () => {
  assert.deepEqual(['配件类', '电池类', '干烧类'].map(categoryTone), ['cyan', 'violet', 'amber'])
  assert.deepEqual(['市场类型报告', '研发类型报告', '产品类型报告'].map(name => semanticTone('report', name)), ['cyan', 'violet', 'amber'])
  assert.deepEqual(['竞品动态', '市场反馈', '独立站评价'].map(name => semanticTone('signal', name)), ['violet', 'cyan', 'amber'])
  assert.equal(categoryTone('全部产品'), 'neutral')
  assert.equal(categoryTone('未分类'), 'neutral')
  assert.equal(fieldTone('kind', '竞品动态'), 'violet')
  const custom = ['温控类', '包装类', '新材料类', '自定义🙂类']
  const forward = Object.fromEntries(custom.map(name => [name, categoryTone(name)]))
  const reversed = Object.fromEntries([...custom].reverse().map(name => [name, categoryTone(name)]))
  assert.deepEqual(forward, reversed)
  assert.ok(custom.every(name => !['neutral', 'red'].includes(categoryTone(name))))
  for (const name of ['constructor', '__proto__', 'toString']) {
    assert.ok(Object.hasOwn(semanticPalette, categoryTone(name)))
    assert.doesNotThrow(() => toneStyle(categoryTone(name)))
  }
})

test('severity, task and document statuses have explicit colors with neutral unknown values', () => {
  assert.equal(statusTone('已逾期'), 'red')
  assert.equal(statusTone('负向'), 'red')
  assert.equal(statusTone('风险'), 'amber')
  assert.equal(statusTone('待评审'), 'amber')
  assert.equal(statusTone('进行中'), 'blue')
  assert.equal(statusTone('已完成'), 'violet')
  assert.equal(statusTone('已归档'), 'violet')
  assert.equal(statusTone('暂停'), 'neutral')
  assert.equal(statusTone('未知状态'), 'neutral')
  assert.equal(statusTone('constructor'), 'neutral')
  assert.equal(fieldTone('status', '已完成'), 'violet')
  assert.equal(fieldTone('category', '电池类'), 'violet')
})

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
  const linear = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
}
test('all semantic tag text colors meet 4.5:1 contrast and CSS tokens use the shared palette', () => {
  for (const [tone, palette] of Object.entries(semanticPalette)) {
    const ratio = (luminance(palette.background) + .05) / (luminance(palette.ink) + .05)
    assert.ok(ratio >= 4.5, `${tone}: ${ratio}`)
    assert.deepEqual(toneStyle(tone), {
      '--semantic-ink': palette.ink, '--semantic-bg': palette.background,
      '--semantic-border': palette.border, '--semantic-solid': palette.solid,
    })
  }
})
