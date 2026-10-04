import type { ProjectProfile } from './types'
export const projectProfileKeys = ['priority', 'phase', 'structural_owner', 'target', 'key_plan', 'risk_note', 'actual_completed_on'] as const
export const milestoneTemplate = ['立项', '结构设计', '手板打样', '交手板样', '确认', 'DFM', '投模', '专利', 'T0', 'T1', '试产备料', '试产', '转量产']
export const emptyProfile = (): ProjectProfile => ({ priority: '', phase: '', structural_owner: '', target: '', key_plan: '', risk_note: '', actual_completed_on: '', progress_known: false })
export const emptyMilestone = () => ({ name: '', owner: '', planned_start: '', planned_end: '', actual_start: '', actual_end: '', status: '待开始', recorded_text: '', note: '', sort_order: 0 })
// Presentation only; persisted content and editor values keep the complete text.
export const displayProjectText = (value: string) => value.replace(/[ \t]{8,}/g, '\n').replace(/[ \t]{2,}/g, ' ').split('\n').map(line => line.trim()).filter(Boolean).join('\n')
export function projectBody(values: Record<string, unknown>) {
  const result = { ...values }
  const profile: Record<string, string> = {}
  for (const key of projectProfileKeys) { profile[key] = String(result[key] || ''); delete result[key] }
  delete result.profile; delete result.import_info
  if (result.progress === '') delete result.progress
  return { ...result, profile }
}
export function validateMilestone(value: ReturnType<typeof emptyMilestone>) {
  if (!value.name.trim()) throw new Error('请填写节点名称')
  for (const date of [value.planned_start, value.planned_end, value.actual_start, value.actual_end]) {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw new Error('日期格式不正确')
  }
  if (value.planned_start && value.planned_end && value.planned_start > value.planned_end || value.actual_start && value.actual_end && value.actual_start > value.actual_end) throw new Error('结束日期应不早于开始日期')
  if (!['待开始', '进行中', '已完成', '暂停', '待确认'].includes(value.status)) throw new Error('节点状态不正确')
  if (!Number.isInteger(value.sort_order) || value.sort_order < 0 || value.sort_order > 10000) throw new Error('排序应为 0–10000 的整数')
  return value
}
