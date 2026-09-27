import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Pencil, Plus } from 'lucide-react'
import { api } from './api'
import type { Category, CustomField } from './types'

type Scope = 'project' | 'report'
type CategoryDraft = Omit<Category, 'id'> & { id?: string }
type FieldDraft = Omit<CustomField, 'id' | 'options'> & { id?: string; optionsText: string }
type Props = { categories: Category[]; fields: CustomField[]; onChanged: () => Promise<void> }

export default function ClassificationSettings({ categories, fields, onChanged }: Props) {
  const [scope, setScope] = useState<Scope>('project')
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null)
  const [fieldDraft, setFieldDraft] = useState<FieldDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const scopedCategories = categories.filter(item => item.scope === scope).sort((a, b) => a.sort_order - b.sort_order)
  const scopedFields = fields.filter(item => item.scope === scope).sort((a, b) => a.sort_order - b.sort_order)
  function switchScope(next: Scope) { setScope(next); setCategoryDraft(null); setFieldDraft(null); setError(''); setNotice('') }
  async function saveCategory(event: FormEvent) {
    event.preventDefault()
    if (!categoryDraft) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { id, ...payload } = categoryDraft
      await api(`/categories${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', payload)
      await onChanged(); setCategoryDraft(null); setNotice('分类已保存')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') }
    finally { setBusy(false) }
  }
  async function saveField(event: FormEvent) {
    event.preventDefault()
    if (!fieldDraft) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { id, optionsText, ...rest } = fieldDraft
      const options = fieldDraft.kind === 'select' ? optionsText.split(/[，,\n]/).map(item => item.trim()).filter(Boolean) : []
      await api(`/custom-fields${id ? `/${id}` : ''}`, id ? 'PATCH' : 'POST', { ...rest, options })
      await onChanged(); setFieldDraft(null); setNotice('字段已保存')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败') }
    finally { setBusy(false) }
  }
  return <div className="classification-settings"><div className="settings-tabs" role="tablist" aria-label="配置范围"><button role="tab" aria-selected={scope === 'project'} className={scope === 'project' ? 'active' : ''} onClick={() => switchScope('project')}>研发项目</button><button role="tab" aria-selected={scope === 'report'} className={scope === 'report' ? 'active' : ''} onClick={() => switchScope('report')}>报告档案</button></div>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="settings-notice" role="status">{notice}</div>}
    <section className="settings-section"><div className="section-heading"><div><h2>{scope === 'project' ? '项目品类' : '报告类型'}</h2></div><button className="button" onClick={() => { setCategoryDraft({ scope, name: '', active: true, sort_order: scopedCategories.length * 10 + 10 }); setFieldDraft(null) }}><Plus size={15}/>新增分类</button></div><div className="settings-list">{scopedCategories.map(category => <div className="settings-row" key={category.id}><div><strong>{category.name}</strong><small>{category.active ? '启用中' : '已停用'} · 排序 {category.sort_order}</small></div><button className="text-button" onClick={() => { setCategoryDraft({ ...category }); setFieldDraft(null) }}><Pencil size={13}/>编辑</button></div>)}</div>{categoryDraft && <form className="settings-form" onSubmit={event => void saveCategory(event)}><h3>{categoryDraft.id ? '编辑分类' : '新增分类'}</h3><div className="settings-form-grid"><label>分类名称<input aria-label="分类名称" maxLength={100} required value={categoryDraft.name} onChange={event => setCategoryDraft({ ...categoryDraft, name: event.target.value })}/></label><label>排序值<input aria-label="分类排序" type="number" min="0" max="10000" required value={categoryDraft.sort_order} onChange={event => setCategoryDraft({ ...categoryDraft, sort_order: Number(event.target.value) })}/></label><label className="settings-check"><input type="checkbox" checked={categoryDraft.active} onChange={event => setCategoryDraft({ ...categoryDraft, active: event.target.checked })}/>启用该分类</label></div><div className="settings-form-actions"><button type="button" className="button" onClick={() => setCategoryDraft(null)}>取消</button><button className="button primary" disabled={busy}>保存分类<ArrowRight size={14}/></button></div></form>}</section>
    <section className="settings-section"><div className="section-heading"><div><h2>自定义字段</h2></div><button className="button" onClick={() => { setFieldDraft({ scope, key: '', label: '', kind: 'text', optionsText: '', required: false, active: true, sort_order: scopedFields.length * 10 + 10 }); setCategoryDraft(null) }}><Plus size={15}/>新增字段</button></div><div className="settings-list">{scopedFields.length ? scopedFields.map(field => <div className="settings-row" key={field.id}><div><strong>{field.label}</strong><small>{field.key} · {{ text: '文本', number: '数字', date: '日期', select: '单选' }[field.kind]} · {field.active ? '启用中' : '已停用'}</small></div><button className="text-button" onClick={() => { setFieldDraft({ ...field, optionsText: field.options.join('，') }); setCategoryDraft(null) }}><Pencil size={13}/>编辑</button></div>) : <p className="settings-empty">还没有附加字段，可按团队工作方式新增。</p>}</div>{fieldDraft && <form className="settings-form" onSubmit={event => void saveField(event)}><h3>{fieldDraft.id ? '编辑字段' : '新增字段'}</h3><div className="settings-form-grid"><label>字段标识<input aria-label="字段标识" required pattern="[a-z][a-z0-9_]*" maxLength={64} disabled={!!fieldDraft.id} placeholder="例如 priority_level" value={fieldDraft.key} onChange={event => setFieldDraft({ ...fieldDraft, key: event.target.value })}/></label><label>显示名称<input aria-label="字段名称" required maxLength={100} placeholder="例如 优先级" value={fieldDraft.label} onChange={event => setFieldDraft({ ...fieldDraft, label: event.target.value })}/></label><label>字段类型<select aria-label="字段类型" value={fieldDraft.kind} onChange={event => setFieldDraft({ ...fieldDraft, kind: event.target.value as CustomField['kind'] })}><option value="text">文本</option><option value="number">数字</option><option value="date">日期</option><option value="select">单选</option></select></label><label>排序值<input aria-label="字段排序" type="number" min="0" max="10000" required value={fieldDraft.sort_order} onChange={event => setFieldDraft({ ...fieldDraft, sort_order: Number(event.target.value) })}/></label>{fieldDraft.kind === 'select' && <label className="settings-wide">候选选项（逗号分隔）<input aria-label="候选选项" required value={fieldDraft.optionsText} onChange={event => setFieldDraft({ ...fieldDraft, optionsText: event.target.value })}/></label>}<label className="settings-check"><input type="checkbox" checked={fieldDraft.required} onChange={event => setFieldDraft({ ...fieldDraft, required: event.target.checked })}/>必填</label><label className="settings-check"><input type="checkbox" checked={fieldDraft.active} onChange={event => setFieldDraft({ ...fieldDraft, active: event.target.checked })}/>启用该字段</label></div><div className="settings-form-actions"><button type="button" className="button" onClick={() => setFieldDraft(null)}>取消</button><button className="button primary" disabled={busy}>保存字段<ArrowRight size={14}/></button></div></form>}</section>
  </div>
}
