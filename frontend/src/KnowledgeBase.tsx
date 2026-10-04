import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ArrowRight, Download, FileText, Pencil, Save, Search, Upload } from 'lucide-react'
import { api } from './api'
import SemanticTag from './SemanticTag'
import { stageTone, statusTone, toneStyle } from './semantics'
import { knowledgeTemplates, stages, starterDocument } from './knowledge-catalog'
import type { KnowledgeTemplate, Stage } from './knowledge-catalog'
import type { KnowledgeDocument, Project } from './types'

type Props = {
  projects: Project[]
  documents: KnowledgeDocument[]
  initialStage?: Stage
  initialProjectId?: string
  onChanged: () => Promise<void>
}

function downloadMarkdown(title: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${title.replace(/[\\/:*?"<>|]/g, '-')}.md`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function KnowledgeBase({ projects, documents, initialStage, initialProjectId, onChanged }: Props) {
  const [stage, setStage] = useState<Stage>(initialStage || stages[0])
  const [projectId, setProjectId] = useState(initialProjectId || '')
  const [templateId, setTemplateId] = useState(() => knowledgeTemplates.find(item => item.stage === (initialStage || stages[0]))!.id)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState('')
  const [owner, setOwner] = useState('')
  const [status, setStatus] = useState<'草稿' | '待评审' | '已归档'>('草稿')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const template = knowledgeTemplates.find(item => item.id === templateId) || knowledgeTemplates[0]
  const project = projects.find(item => item.id === projectId)
  const document = documents.find(item => item.template_id === template.id && item.project_id === projectId)
  const defaultContent = useMemo(() => starterDocument(template, project?.name), [template, project?.name])
  const dirty = editing && (content !== (document?.content || defaultContent) || owner !== (document?.owner || template.owner) || status !== (document?.status || '草稿'))

  useEffect(() => {
    setContent(document?.content || defaultContent)
    setOwner(document?.owner || template.owner)
    setStatus(document?.status || '草稿')
    setEditing(false)
    setError('')
  }, [document?.id, document?.content, document?.owner, document?.status, defaultContent, template.owner])

  function canLeave() { return !dirty || window.confirm('当前文档有未保存内容，确定离开吗？') }
  function selectStage(next: Stage) {
    if (!canLeave()) return
    setStage(next)
    setTemplateId(knowledgeTemplates.find(item => item.stage === next)!.id)
    setNotice('')
  }
  function selectTemplate(item: KnowledgeTemplate) {
    if (!canLeave()) return
    setTemplateId(item.id)
    setNotice('')
  }
  function selectProject(next: string) {
    if (!canLeave()) return
    setProjectId(next)
    setNotice('')
  }
  const visible = knowledgeTemplates.filter(item => item.stage === stage && `${item.title} ${item.activity} ${item.owner} ${item.inputs}`.toLowerCase().includes(query.trim().toLowerCase()))
  const savedCount = knowledgeTemplates.filter(item => item.stage === stage && documents.some(doc => doc.template_id === item.id && doc.project_id === projectId)).length

  async function saveDocument() {
    if (!content.trim()) { setError('文档内容不能为空'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const payload = { project_id: projectId, template_id: template.id, stage: template.stage, title: template.title, owner: owner.trim(), status, content }
      await api(`/knowledge_documents${document ? `/${document.id}` : ''}`, document ? 'PATCH' : 'POST', payload)
      await onChanged()
      setEditing(false)
      setNotice('文档已保存到本地工作空间')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  async function importMarkdown(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!/\.md$/i.test(file.name) || file.size > 100000) { setError('请选择不超过 100 KB 的 Markdown 文件'); return }
    setContent(await file.text())
    setError('')
    setEditing(true)
  }

  return <div className="kb-page" data-tone={stageTone(stage)} style={toneStyle(stageTone(stage))}>
    <div className="kb-count"><strong>{knowledgeTemplates.length}</strong><span>份模板</span></div>
    <div className="kb-stages" role="tablist" aria-label="研发阶段">{stages.map((item, index) => <button key={item} data-tone={stageTone(item)} style={toneStyle(stageTone(item))} role="tab" aria-selected={stage === item} className={stage === item ? 'active' : ''} onClick={() => selectStage(item)}><span>0{index + 1}</span>{item}<small>{knowledgeTemplates.filter(doc => doc.stage === item).length} 份</small></button>)}</div>
    <div className="kb-toolbar"><label>关联项目<select aria-label="关联项目" value={projectId} onChange={event => selectProject(event.target.value)}><option value="">通用文档</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="search-field"><Search size={17}/><input aria-label="搜索流程文档" value={query} placeholder="搜索输出、活动、责任人…" onChange={event => setQuery(event.target.value)}/></label><span>{savedCount} / {knowledgeTemplates.filter(item => item.stage === stage).length} 已建立</span></div>
    <div className="kb-layout"><aside className="kb-index" aria-label="阶段输出目录">{visible.length ? visible.map((item, index) => { const saved = documents.find(doc => doc.template_id === item.id && doc.project_id === projectId); return <div key={item.id}>{(index === 0 || visible[index - 1].activity !== item.activity) && <p className="kb-activity">{item.activity}</p>}<button className={`kb-index-item ${template.id === item.id ? 'selected' : ''}`} onClick={() => selectTemplate(item)} aria-current={template.id === item.id ? 'true' : undefined}><FileText size={16}/><span><strong>{item.title}</strong><small>{item.owner}</small></span><SemanticTag kind="status" value={saved?.status || '模板'}/></button></div> }) : <p className="kb-no-results">该阶段没有匹配的文档。</p>}</aside>
      <section className="kb-detail" aria-label="文档详情"><div className="kb-detail-head"><p className="eyebrow"><SemanticTag kind="stage" value={template.stage}/><span>{template.activity}</span></p><div className="kb-title-row"><h2>{template.title}</h2>{document && <SemanticTag kind="status" value={document.status} className="kb-status"/>}</div><p>{project ? `${project.name} · 项目文档` : '通用文档'}{template.gate ? ` · ${template.gate}` : ''}</p></div>
        <dl className="kb-meta"><div><dt>流程输入</dt><dd>{template.inputs}</dd></div><div><dt>责任人</dt><dd>{template.owner}</dd></div><div><dt>交付重点</dt><dd>{template.focus}</dd></div></dl>
        {error && <p className="kb-error" role="alert">{error}</p>}{notice && <p className="kb-notice" role="status">{notice}</p>}
        <div className="kb-document-head"><div><h3>{document ? '文档内容' : '标准模板预览'}</h3><p>{document ? `最后更新 ${new Date(document.updated_at).toLocaleString('zh-CN')}` : '填写后保存为当前项目的文档'}</p></div><div className="kb-document-actions"><button className="button" onClick={() => downloadMarkdown(template.title, editing ? content : document?.content || defaultContent)}><Download size={15}/>下载 MD</button>{!editing ? <button className="button primary" onClick={() => setEditing(true)}><Pencil size={15}/>{document ? '编辑文档' : '按模板创建'}</button> : <button className="button primary" disabled={saving} onClick={() => void saveDocument()}><Save size={15}/>{saving ? '保存中…' : '保存文档'}</button>}</div></div>
        {editing ? <div className="kb-editor"><div className="kb-editor-meta"><label>文档责任人<input aria-label="文档责任人" maxLength={100} value={owner} onChange={event => setOwner(event.target.value)}/></label><label>文档状态<select className="semantic-control" data-tone={statusTone(status)} style={toneStyle(statusTone(status))} aria-label="文档状态" value={status} onChange={event => setStatus(event.target.value as typeof status)}><option>草稿</option><option>待评审</option><option>已归档</option></select></label></div><label className="kb-import"><Upload size={15}/>导入本地 Markdown<input aria-label="导入本地 Markdown" type="file" accept=".md,text/markdown" onChange={event => void importMarkdown(event)}/></label><textarea aria-label="Markdown 文档内容" value={content} onChange={event => setContent(event.target.value)} maxLength={100000} spellCheck={false}/><div className="kb-edit-foot"><span>Markdown · {content.length.toLocaleString('zh-CN')} / 100,000 字符</span><button className="text-button" onClick={() => { if (!canLeave()) return; setEditing(false) }}>取消编辑<ArrowRight size={14}/></button></div></div> : <pre className="kb-markdown">{document?.content || defaultContent}</pre>}
      </section></div>
  </div>
}
