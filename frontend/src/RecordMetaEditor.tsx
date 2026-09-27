import { useEffect, useState } from 'react'
import { ArrowRight, Save } from 'lucide-react'
import { api } from './api'
import type { Category, CustomField, EntityMeta } from './types'

type Props = {
  scope: 'project' | 'report'
  entityId: string
  categories: Category[]
  fields: CustomField[]
  meta?: EntityMeta
  onChanged: () => Promise<void>
  onManage: () => void
}

export default function RecordMetaEditor({ scope, entityId, categories, fields, meta, onChanged, onManage }: Props) {
  const [categoryId, setCategoryId] = useState(meta?.category_id || (scope === 'report' ? 'report-product' : ''))
  const [values, setValues] = useState<Record<string, string>>(meta?.values || {})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { setCategoryId(meta?.category_id || (scope === 'report' ? 'report-product' : '')); setValues(meta?.values || {}) }, [scope, entityId, meta])
  useEffect(() => { setMessage(''); setError('') }, [scope, entityId])
  const visibleCategories = categories.filter(item => item.scope === scope && (item.active || item.id === categoryId)).sort((a, b) => a.sort_order - b.sort_order)
  const visibleFields = fields.filter(item => item.scope === scope && (item.active || values[item.key])).sort((a, b) => a.sort_order - b.sort_order)
  const currentCategory = visibleCategories.find(item => item.id === categoryId)?.name || '未分类'
  async function save() {
    setBusy(true); setError(''); setMessage('')
    try {
      await api(`/entity-meta/${scope}/${entityId}`, 'PUT', { category_id: categoryId, values })
      await onChanged()
      setMessage('分类与字段已保存')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') }
    finally { setBusy(false) }
  }
  return <details className="record-meta" aria-label="分类与自定义字段"><summary><span><strong>分类与自定义字段</strong><small>{currentCategory} · {visibleFields.length} 个附加字段</small></span><span className="record-meta-toggle">编辑设置</span></summary><div className="record-meta-body"><div className="record-meta-head"><div><h3>分类与自定义字段</h3><p>分类用于看板筛选；附加字段由管理入口统一配置。</p></div><button className="text-button" onClick={onManage}>字段管理<ArrowRight size={13}/></button></div><div className="record-meta-fields"><label>所属分类<select aria-label="所属分类" value={categoryId} onChange={event => setCategoryId(event.target.value)}><option value="">未分类</option>{visibleCategories.map(item => <option key={item.id} value={item.id}>{item.name}{item.active ? '' : '（已停用）'}</option>)}</select></label>{visibleFields.map(field => <label key={field.id}>{field.label}{field.required && <span> *</span>}{field.kind === 'select' ? <select aria-label={field.label} value={values[field.key] || ''} onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.value }))}><option value="">请选择</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select> : <input aria-label={field.label} type={field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'} value={values[field.key] || ''} onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.value }))}/>}</label>)}</div><div className="record-meta-actions">{error && <span className="record-meta-error" role="alert">{error}</span>}{message && <span className="record-meta-success" role="status">{message}</span>}<button className="button" disabled={busy} onClick={() => void save()}><Save size={14}/>{busy ? '保存中…' : '保存分类与字段'}</button></div></div></details>
}
