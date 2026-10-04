import { Boxes } from 'lucide-react'
import { productCategoryCards } from './classification'
import { categoryTone, toneStyle } from './semantics'
import type { Product, Sale } from './types'

type Props = {
  products: Product[]
  sales: Sale[]
  month: string
  filter: string
  onFilter: (filter: string) => void
}

const money = (cents: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(cents / 100)

export default function ProductBoard({ products, sales, month, filter, onFilter }: Props) {
  const cards = productCategoryCards(products, sales, month)
  return <section className="project-board product-board" aria-label="产品分类看板">
    <div className="project-board-heading"><h2>产品分类</h2></div>
    <div className="project-board-cards">{cards.map(item => <button key={item.id} className={`project-board-card ${filter === item.id ? 'selected' : ''}`} data-tone={categoryTone(item.label)} style={toneStyle(categoryTone(item.label))} aria-pressed={filter === item.id} onClick={() => onFilter(item.id)}><span><Boxes size={16}/>{item.label}</span><strong>{item.count}<small> 款</small></strong><small>{month} 净销售额 · {money(item.revenue_cents)}</small></button>)}</div>
  </section>
}
