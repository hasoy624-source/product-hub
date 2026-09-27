import { Boxes } from 'lucide-react'
import { productCategoryCards } from './classification'
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
    <div className="project-board-heading"><div><p className="eyebrow">PRODUCT CATEGORIES</p><h2>产品分类</h2><p>点击品类，筛选下方产品档案与所选月销售明细。</p></div></div>
    <div className="project-board-cards">{cards.map(item => <button key={item.id} className={`project-board-card ${filter === item.id ? 'selected' : ''}`} aria-pressed={filter === item.id} onClick={() => onFilter(item.id)}><span><Boxes size={16}/>{item.label}</span><strong>{item.count}<small> 款</small></strong><small>{month} 净销售额 · {money(item.revenue_cents)}</small></button>)}</div>
  </section>
}
