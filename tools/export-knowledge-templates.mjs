import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { knowledgeTemplates, stages, starterDocument } from '../frontend/src/knowledge-catalog.ts'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../docs/研发流程知识库')
mkdirSync(root, { recursive: true })
const lines = [
  '# 研发流程知识库 · 输出文档目录',
  '',
  '按五阶段研发流程与 Gate 1–4 评审整理。每份 Markdown 均为可填写模板；实际项目内容以系统「流程知识库」中的项目文档为准。',
  '',
  '本地预览：运行项目后打开 `http://127.0.0.1:8011/#knowledge`（或实际启动端口），选择阶段、项目与输出文档。可编辑、导入或下载 Markdown。',
  '',
  '| 阶段 | 输出文档数 | 对应评审 |',
  '| --- | ---: | --- |',
  ...stages.map(stage => { const items = knowledgeTemplates.filter(item => item.stage === stage); return `| ${stage} | ${items.length} | ${[...new Set(items.map(item => item.gate).filter(Boolean))].join('、') || '—'} |` }),
  '',
]
for (const stage of stages) {
  mkdirSync(join(root, stage), { recursive: true })
  lines.push(`## ${stage}`, '', '| 流程活动 | 输出文档 | 责任人 |', '| --- | --- | --- |')
  for (const item of knowledgeTemplates.filter(row => row.stage === stage)) {
    writeFileSync(join(root, stage, `${item.id}.md`), starterDocument(item), 'utf8')
    lines.push(`| ${item.activity} | [${item.title}](./${stage}/${item.id}.md) | ${item.owner} |`)
  }
  lines.push('')
}
writeFileSync(join(root, '目录.md'), lines.join('\n'), 'utf8')
console.log(`EXPORTED=${knowledgeTemplates.length} STAGES=${stages.length} INDEX=${join(root, '目录.md')}`)
