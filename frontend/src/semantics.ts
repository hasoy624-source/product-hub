import type { CSSProperties } from 'react'

// One palette drives tags, stage navigation, progress and classification filters.
// Business-stage colors are not severity levels; text labels always remain visible.
export const semanticPalette = {
  cyan: { ink: '#11637A', background: '#E7F6FC', border: '#B7DDE8', solid: '#2994AF' },
  blue: { ink: '#2C56A2', background: '#EDF2FF', border: '#CAD8FB', solid: '#5C83D5' },
  violet: { ink: '#6741A5', background: '#F3EEFF', border: '#DCCCF7', solid: '#9670D2' },
  amber: { ink: '#8D5715', background: '#FFF4DE', border: '#F1D4A2', solid: '#D39A40' },
  rose: { ink: '#99345F', background: '#FCEEF5', border: '#EFC7DB', solid: '#C86A95' },
  red: { ink: '#A93832', background: '#FDEDEC', border: '#EFC3BF', solid: '#CF635C' },
  neutral: { ink: '#5E697D', background: '#F0F2F6', border: '#DFE3EB', solid: '#9AA3B3' },
} as const
export type SemanticTone = keyof typeof semanticPalette
export type SemanticKind = 'stage' | 'status' | 'category' | 'report' | 'signal'

const stageTones: Record<string, SemanticTone> = {
  '概念与启动': 'cyan', '设计与开发': 'blue', EVT: 'violet', DVT: 'amber', MP: 'rose',
}
const statusTones: Record<string, SemanticTone> = {
  '正常': 'cyan', '在售': 'cyan', '正向': 'cyan', '已启用': 'cyan',
  '进行中': 'blue', '研发中': 'blue', '待立项': 'amber', '已终止': 'neutral', '待确认': 'neutral', '待办': 'amber', '待评审': 'amber', '风险': 'amber',
  '已完成': 'violet', '已归档': 'violet', '逾期': 'red', '已逾期': 'red', '负向': 'red',
  '暂停': 'neutral', '停产': 'neutral', '草稿': 'neutral', '中性': 'neutral',
}
const categoryTones: Record<string, SemanticTone> = {
  '配件类': 'cyan', '电池类': 'violet', '干烧类': 'amber',
  '市场类型报告': 'cyan', '研发类型报告': 'violet', '产品类型报告': 'amber',
  '竞品动态': 'violet', '市场反馈': 'cyan', '独立站评价': 'amber',
}
const neutralLabels = new Set(['', '未分类', '全部', '全部项目', '全部产品', '全部报告'])
const customTones: SemanticTone[] = ['cyan', 'blue', 'violet', 'amber', 'rose']
export const stageTone = (stage: string): SemanticTone => Object.hasOwn(stageTones, stage) ? stageTones[stage] : 'neutral'
export const statusTone = (status: string): SemanticTone => Object.hasOwn(statusTones, status) ? statusTones[status] : 'neutral'
export function categoryTone(name: string): SemanticTone {
  if (neutralLabels.has(name)) return 'neutral'
  if (Object.hasOwn(categoryTones, name)) return categoryTones[name]
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.codePointAt(0)!) >>> 0
  return customTones[hash % customTones.length]
}
export function semanticTone(kind: SemanticKind, value: string): SemanticTone {
  return kind === 'stage' ? stageTone(value) : kind === 'status' ? statusTone(value) : categoryTone(value)
}
export function toneStyle(tone: SemanticTone): CSSProperties {
  const palette = semanticPalette[tone]
  return { '--semantic-ink': palette.ink, '--semantic-bg': palette.background, '--semantic-border': palette.border, '--semantic-solid': palette.solid } as CSSProperties
}
export function fieldTone(key: string, value: string): SemanticTone {
  return key === 'stage' ? stageTone(value) : ['category', 'kind'].includes(key) ? categoryTone(value) : statusTone(value)
}
