import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react'
import SemanticTag from './SemanticTag'
import { stages } from './knowledge-catalog'
import { stageTone, toneStyle } from './semantics'
import { featuredProductCategories, filterProducts, filterSalesByProducts } from './classification'
import { exceptionDetails } from './exceptions'
import type { ExceptionView } from './exceptions'
import { completeDemoTask, createDemoWorkspace, demoMonth, demoScenarios, demoToday, recordDemoSale } from './guide-demo-model'

const money = (cents: number) => `¥${(cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const formatMonth = (month: string) => `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`
function Feedback({ children }: { children: ReactNode }) { return <p className="guide-demo-feedback" role="status">{children}</p> }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="guide-demo-field"><span>{label}</span>{children}</label> }
function Record({ title, children }: { title: string; children?: ReactNode }) { return <div className="guide-demo-record"><strong>{title}</strong>{children}</div> }

const flowSteps = [
  { label: '产品', action: '新建产品', title: '示例·多功能切膏刀', fields: [['SKU', 'DEMO-B01'], ['类别', '电池类'], ['负责人', '示例负责人']] },
  { label: '项目', action: '新建项目', title: '示例·切膏刀研发', fields: [['关联产品', '多功能切膏刀'], ['阶段', 'EVT'], ['计划完成', '2026-10-20']] },
  { label: '任务', action: '添加任务', title: '完成样机验证', fields: [['所属项目', '切膏刀研发'], ['截止日期', '2026-10-01'], ['状态', '进行中']] },
  { label: '文档', action: '按模板创建', title: 'EVT 验证报告', fields: [['关联项目', '切膏刀研发'], ['文档状态', '草稿'], ['下一步', '填写内容并保存文档']] },
  { label: '经营', action: '录入销售 / 生成报告', title: '10 月经营记录', fields: [['统计月份', '2026-10'], ['净销售额', '¥1,280.50'], ['报告类型', '产品类型报告']] },
]
function StartDemo() {
  const [step, setStep] = useState(0)
  const current = flowSteps[step]
  return <>
    <ol className="guide-demo-flow" aria-label="首次使用流程">{flowSteps.map((item, index) => <li key={item.label}><button aria-label={`第 ${index + 1} 步：${item.label}`} aria-pressed={step === index} onClick={() => setStep(index)}><span>{index < step ? <Check size={15}/> : index + 1}</span>{item.label}</button></li>)}</ol>
    <div className="guide-demo-caption">第 {step + 1} 步 · {current.action}</div>
    <Record title={current.title}><dl>{current.fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></Record>
    <div className="guide-demo-actions"><button className="button" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={14}/>上一步</button><button className="button primary" disabled={step === flowSteps.length - 1} onClick={() => setStep(step + 1)}>下一步<ArrowRight size={14}/></button></div>
    <Feedback>{step === 4 ? '五个环节已走完。可以进入详细说明查看真实操作步骤。' : `当前示例：${current.label}。点击下一步继续。`}</Feedback>
  </>
}

function ExceptionsDemo({ overview = false }: { overview?: boolean }) {
  const [workspace, setWorkspace] = useState(createDemoWorkspace)
  const [selected, setSelected] = useState<ExceptionView>('tasks')
  const [message, setMessage] = useState('')
  const details = exceptionDetails(workspace, demoToday)
  const group = details.groups.find(item => item.id === selected)!
  let offset = 0
  const records = selected === 'tasks' ? details.tasks.map(task => ({ id: task.id, title: task.title, detail: `截止 ${task.due_date}`, status: '逾期' }))
    : selected === 'projects' ? details.projects.map(project => ({ id: project.id, title: project.name, detail: `计划完成 ${project.due_date}`, status: project.status }))
    : details.signals.map(signal => ({ id: signal.id, title: signal.title, detail: signal.occurred_on, status: signal.sentiment }))
  return <>
    <div className="guide-demo-caption">异常概览 · 示例日期 {demoToday}</div>
    <div className="guide-demo-chart">
      <svg viewBox="0 0 180 180" className="guide-demo-donut" role="group" aria-label="可点击的异常饼图">
        <circle cx="90" cy="90" r="62" fill="none" stroke="#eef0f5" strokeWidth="20"/>
        {details.groups.filter(item => item.count > 0).map(item => {
          const size = item.count / details.total * 2 * Math.PI * 62
          const start = offset; offset += size
          return <circle key={item.id} role="button" tabIndex={0} aria-label={`饼图：${item.label} ${item.count} 条`} aria-pressed={selected === item.id} cx="90" cy="90" r="62" fill="none" stroke={item.color} strokeWidth={selected === item.id ? 24 : 18} strokeDasharray={`${size} ${2 * Math.PI * 62 - size}`} strokeDashoffset={-start} transform="rotate(-90 90 90)" onClick={() => { setSelected(item.id); setMessage('') }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(item.id); setMessage('') } }}/>
        })}
        <text x="90" y="89" textAnchor="middle" className="guide-demo-total">{details.total}</text><text x="90" y="111" textAnchor="middle" className="guide-demo-total-label">异常条目</text>
      </svg>
      <div className="guide-demo-legend">{details.groups.map(item => <button key={item.id} aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setMessage('') }}><i aria-hidden="true" style={{ background: item.color }}/><span>{item.label}</span><b>{item.count}</b></button>)}</div>
    </div>
    <div className="guide-demo-list-head"><strong>{group.label}明细</strong><span>{group.count} 条</span></div>
    {records.length ? records.map(record => <Record key={record.id} title={record.title}><div className="guide-demo-meta"><span>{record.detail}</span><SemanticTag kind="status" value={record.status}/></div>{!overview && selected === 'tasks' && <button className="button" onClick={() => { setWorkspace(completeDemoTask(workspace, record.id, true)); setMessage('示例任务已完成，逾期任务 1 → 0，异常总数 3 → 2。项目仍是风险状态。') }}><Check size={14}/>标记示例任务完成</button>}</Record>) : <p className="guide-demo-empty">当前分类没有异常记录。</p>}
    <Feedback>{message || `已展示${group.label}。${overview ? '实际页面会进入对应异常明细。' : '示例处理只更新当前演示。'}`}</Feedback>
  </>
}

function StageSelector({ value, onChange }: { value: string; onChange: (stage: string) => void }) {
  return <div className="guide-demo-stages" aria-label="示例阶段选择">{stages.map(stage => <button key={stage} className={value === stage ? 'selected' : ''} style={toneStyle(stageTone(stage))} aria-pressed={value === stage} onClick={() => onChange(stage)}>{stage}</button>)}</div>
}
function ProjectsDemo({ colors = false }: { colors?: boolean }) {
  const [stage, setStage] = useState('EVT')
  const [progress, setProgress] = useState(55)
  const [done, setDone] = useState(false)
  return <>
    <StageSelector value={stage} onChange={setStage}/>
    <Record title="示例·切膏刀研发"><div className="guide-demo-meta"><SemanticTag kind="stage" value={stage}/><SemanticTag kind="status" value="正常"/></div>
      <div className="guide-demo-progress" style={toneStyle(stageTone(stage))}><div><span>项目进度</span><b>{progress}%</b></div><progress aria-label="示例项目进度" value={progress} max={100}/></div>
      {!colors && <Field label="调整示例进度"><input aria-label="调整示例进度" type="range" min="0" max="100" value={progress} onChange={event => setProgress(Number(event.target.value))}/></Field>}
    </Record>
    {colors ? <div className="guide-demo-color-key"><div><span>品类</span><SemanticTag kind="category" value="电池类"/><SemanticTag kind="category" value="干烧类"/><SemanticTag kind="category" value="配件类"/></div><div><span>任务状态</span>{['待办', '进行中', '已完成', '逾期'].map(status => <SemanticTag key={status} kind="status" value={status}/>)}</div></div>
      : <label className="guide-demo-task"><input aria-label="完成样机验证" type="checkbox" checked={done} onChange={event => setDone(event.target.checked)}/><span>完成样机验证</span><SemanticTag kind="status" value={done ? '已完成' : '进行中'}/></label>}
    <Feedback>{colors ? `当前 ${stage} 的标签与进度使用相同颜色。品类与状态请结合文字识别。` : `${done ? '任务已完成' : '任务进行中'}；项目阶段仍为 ${stage}，进度为 ${progress}%。`}</Feedback>
  </>
}

function ProductsDemo() {
  const [workspace, setWorkspace] = useState(createDemoWorkspace)
  const [category, setCategory] = useState('all')
  const [productId, setProductId] = useState('demo-battery')
  const [amount, setAmount] = useState('1280.50')
  const [message, setMessage] = useState('金额按元填写，保存后按整数分记录。')
  const [error, setError] = useState(false)
  const products = filterProducts(workspace.products, category)
  const sales = filterSalesByProducts(workspace.sales, workspace.products, category, demoMonth)
  function save(event: FormEvent) {
    event.preventDefault()
    try {
      const updated = recordDemoSale(workspace, productId, amount)
      setWorkspace(updated); setError(false)
      const sale = updated.sales.at(-1)!
      setMessage(`示例销售已保存：${money(sale.revenue_cents)} = ${sale.revenue_cents.toLocaleString('zh-CN')} 分。可切换品类查看合计。`)
    } catch (reason) { setError(true); setMessage((reason as Error).message) }
  }
  return <>
    <div className="guide-demo-filters" aria-label="示例产品品类">{['all', ...featuredProductCategories].map(item => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item === 'all' ? '全部产品' : <SemanticTag kind="category" value={item}/>}</button>)}</div>
    <div className="guide-demo-list-head"><strong>{products.length} 款产品</strong><span>{formatMonth(demoMonth)} · {money(sales.reduce((sum, sale) => sum + sale.revenue_cents, 0))}</span></div>
    <ul className="guide-demo-simple-list">{products.map(product => <li key={product.id}><span>{product.name}</span><SemanticTag kind="category" value={product.category}/></li>)}</ul>
    <form className="guide-demo-form" onSubmit={save} noValidate><h4>录入示例销售</h4><Field label="产品"><select value={productId} onChange={event => { setProductId(event.target.value); setMessage(''); setError(false) }}>{workspace.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field><Field label="净销售额（元）"><input value={amount} inputMode="decimal" aria-invalid={error || undefined} aria-describedby="demo-sale-feedback" onChange={event => { setAmount(event.target.value); setMessage(''); setError(false) }}/></Field><button className="button primary" type="submit">保存示例销售</button></form>
    <p id="demo-sale-feedback" className={`guide-demo-feedback ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{message || '当前输入尚未保存。'}</p>
  </>
}

function SignalsDemo() {
  const [kind, setKind] = useState('全部')
  const [sentiment, setSentiment] = useState('负向')
  const signals = createDemoWorkspace().signals.map(signal => signal.id === 'demo-feedback' ? { ...signal, sentiment } : signal)
  const filtered = signals.filter(signal => kind === '全部' || signal.kind === kind)
  return <>
    <div className="guide-demo-filters" aria-label="示例情报类型">{['全部', '市场反馈', '竞品动态'].map(item => <button key={item} aria-pressed={kind === item} onClick={() => setKind(item)}>{item}</button>)}</div>
    {filtered.map(signal => <Record key={signal.id} title={signal.title}><div className="guide-demo-meta"><SemanticTag kind="signal" value={signal.kind}/><SemanticTag kind="status" value={signal.sentiment}/></div><p>{signal.content}</p></Record>)}
    <Field label="“续航体验待改善”的反馈倾向"><select value={sentiment} onChange={event => setSentiment(event.target.value)}>{['正向', '中性', '负向'].map(item => <option key={item}>{item}</option>)}</select></Field>
    <Feedback>{sentiment === '负向' ? '这条反馈计入负向反馈异常；修改倾向后，异常同步变化。' : `示例反馈已改为${sentiment}，不再计入负向反馈异常。`}</Feedback>
  </>
}

function KnowledgeDemo() {
  const [content, setContent] = useState('验证对象：切膏刀样机\n验证结果：续航测试待补充\n待处理：确认测试条件与负责人')
  const [status, setStatus] = useState('草稿')
  const [saved, setSaved] = useState<{ content: string; status: string } | null>(null)
  const dirty = !saved || saved.content !== content || saved.status !== status
  return <>
    <div className="guide-demo-caption">切膏刀研发 / EVT / 输出文档</div>
    <Record title="EVT 验证报告"><div className="guide-demo-meta"><SemanticTag kind="stage" value="EVT"/><SemanticTag kind="status" value={status}/></div></Record>
    <form className="guide-demo-form" onSubmit={event => { event.preventDefault(); setSaved({ content, status }) }}><Field label="文档内容"><textarea rows={3} required value={content} onChange={event => setContent(event.target.value)}/></Field><Field label="文档状态"><select value={status} onChange={event => setStatus(event.target.value)}>{['草稿', '待评审', '已归档'].map(item => <option key={item}>{item}</option>)}</select></Field><button className="button primary" type="submit">保存示例文档</button></form>
    {saved && <div className="guide-demo-saved"><div><strong>已保存版本</strong><SemanticTag kind="status" value={saved.status}/></div><pre>{saved.content}</pre></div>}
    <Feedback>{dirty ? '当前内容尚未保存。文档状态不会自动推进项目阶段。' : `示例文档已保存为${saved?.status}；项目仍处于 EVT。`}</Feedback>
  </>
}

function ReportsDemo() {
  const [category, setCategory] = useState('全部报告')
  const [generated, setGenerated] = useState(false)
  const reports = [
    { title: '9 月市场反馈汇总', type: '市场类型报告', month: '2026-09' },
    { title: '9 月研发进展', type: '研发类型报告', month: '2026-09' },
    ...(generated ? [{ title: '10 月产品经营月报', type: '产品类型报告', month: demoMonth }] : []),
  ].filter(report => category === '全部报告' || category === report.type)
  return <>
    <div className="guide-demo-filters" aria-label="示例报告类型">{['全部报告', '市场类型报告', '研发类型报告', '产品类型报告'].map(item => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
    <div className="guide-demo-list-head"><strong>报告档案</strong><span>{reports.length} 份</span></div>
    {reports.map(report => <Record key={report.title} title={report.title}><div className="guide-demo-meta"><SemanticTag kind="report" value={report.type}/><span>{report.month}</span></div></Record>)}
    {!reports.length && <p className="guide-demo-empty">当前类型暂无报告，请先生成示例。</p>}
    <div className="guide-demo-report-action"><span>所选月份：{formatMonth(demoMonth)}</span><button className="button primary" disabled={generated} onClick={() => { setGenerated(true); setCategory('全部报告') }}>{generated ? '示例已生成' : '生成所选月示例报告'}</button></div>
    {generated && <div className="guide-demo-saved"><strong>示例报告摘要 · 2026-10</strong><p>净销售额 ¥360.00 · 在研项目 1 个 · 负向反馈 1 条</p></div>}
    <Feedback>{generated ? '10 月报告已加入示例档案，9 月记录仍保留。本例不执行后台任务。' : '档案显示多个月份；生成按钮使用所选月份。'}</Feedback>
  </>
}

function IntegrationsDemo() {
  const [name, setName] = useState('示例·市场数据服务')
  const [status, setStatus] = useState('待接入')
  const [saved, setSaved] = useState<{ name: string; status: string } | null>(null)
  const dirty = !saved || saved.name !== name || saved.status !== status
  return <>
    <form className="guide-demo-form" onSubmit={event => { event.preventDefault(); setSaved({ name: name.trim(), status }) }}><Field label="服务名称"><input required maxLength={80} value={name} onChange={event => setName(event.target.value)}/></Field><Field label="席位状态"><select value={status} onChange={event => setStatus(event.target.value)}><option>待接入</option><option>已停用</option></select></Field><button className="button primary" type="submit" disabled={!name.trim()}>保存示例配置</button></form>
    {saved && <Record title={saved.name}><div className="guide-demo-meta"><SemanticTag kind="status" value={saved.status}/><span>配置记录 · 未连接外部服务</span></div></Record>}
    <Feedback>{dirty ? '示例配置尚未保存。此处不填写 API Key。' : `配置已保存，状态为${saved?.status}；没有触发外部连接。`}</Feedback>
  </>
}

type DemoFieldKind = 'text' | 'number' | 'date' | 'select'
function SettingsDemo() {
  const [label, setLabel] = useState('优先级')
  const [kind, setKind] = useState<DemoFieldKind>('select')
  const [field, setField] = useState<{ label: string; kind: DemoFieldKind } | null>(null)
  const [value, setValue] = useState('')
  const [savedValue, setSavedValue] = useState<string | null>(null)
  return <>
    <form className="guide-demo-form" onSubmit={event => { event.preventDefault(); setField({ label: label.trim(), kind }); setValue(''); setSavedValue(null) }}><h4>① 定义研发项目字段</h4><Field label="显示名称"><input required value={label} maxLength={30} onChange={event => setLabel(event.target.value)}/></Field><Field label="字段类型"><select value={kind} onChange={event => setKind(event.target.value as DemoFieldKind)}><option value="text">文本</option><option value="number">数字</option><option value="date">日期</option><option value="select">单选（高、中、低）</option></select></Field><button className="button" type="submit" disabled={!label.trim()}>添加示例字段</button></form>
    {field && <form className="guide-demo-form guide-demo-record-form" onSubmit={event => { event.preventDefault(); setSavedValue(value) }}><h4>② 在示例项目中填写</h4><Field label={field.label}>{field.kind === 'select' ? <select required value={value} onChange={event => setValue(event.target.value)}><option value="">请选择</option>{['高', '中', '低'].map(item => <option key={item}>{item}</option>)}</select> : <input required type={field.kind} value={value} onChange={event => setValue(event.target.value)}/>}</Field><button className="button primary" type="submit">保存示例字段值</button></form>}
    <Feedback>{!field ? '先保存字段定义，记录中才会出现相应输入控件。' : savedValue !== null && savedValue === value ? `已保存：${field.label} = ${savedValue}。这是该示例项目的字段值。` : `已添加“${field.label}”控件，当前记录值尚未保存。`}</Feedback>
  </>
}

function DataDemo() {
  const [saved, setSaved] = useState('示例·切膏刀研发')
  const [draft, setDraft] = useState(saved)
  const [message, setMessage] = useState('先修改名称，再分别尝试保存与重新读取。')
  return <>
    <Record title="已保存的示例记录"><p>{saved}</p></Record>
    <form className="guide-demo-form" onSubmit={event => { event.preventDefault(); setSaved(draft.trim()); setDraft(draft.trim()); setMessage('示例已保存。模拟重新读取会保留这次保存结果。') }}><Field label="编辑名称"><input required value={draft} onChange={event => { setDraft(event.target.value); setMessage('编辑内容尚未提交。') }}/></Field><div className="guide-demo-actions"><button className="button primary" disabled={!draft.trim()} type="submit">保存示例记录</button><button className="button" type="button" onClick={() => { setDraft(saved); setMessage('已模拟重新读取：恢复已保存版本，未保存的编辑没有提交。') }}>模拟重新读取</button></div></form>
    <Feedback>{message}</Feedback>
    <p className="guide-demo-footnote">本例仅在页面内模拟，不读写浏览器存储；离开章节或重置演示后重新开始。</p>
  </>
}

function Scenario({ topicId }: { topicId: string }) {
  switch (topicId) {
    case 'start': return <StartDemo/>
    case 'overview': return <ExceptionsDemo overview/>
    case 'exceptions': return <ExceptionsDemo/>
    case 'projects': return <ProjectsDemo/>
    case 'products': return <ProductsDemo/>
    case 'signals': return <SignalsDemo/>
    case 'knowledge': return <KnowledgeDemo/>
    case 'reports': return <ReportsDemo/>
    case 'integrations': return <IntegrationsDemo/>
    case 'settings': return <SettingsDemo/>
    case 'colors': return <ProjectsDemo colors/>
    case 'data': return <DataDemo/>
    default: return null
  }
}

export default function GuideDemo({ topicId }: { topicId: string }) {
  const [revision, setRevision] = useState(0)
  const scenario = demoScenarios.find(item => item.id === topicId)!
  return <div className="guide-demo">
    <div className="guide-demo-toolbar"><span>交互示例 · 不影响工作空间</span><button onClick={() => setRevision(revision + 1)}><RotateCcw size={14}/>重置演示</button></div>
    <div className="guide-demo-layout"><section className="guide-demo-canvas" aria-label={`${scenario.title}演示`}><Scenario key={`${topicId}-${revision}`} topicId={topicId}/></section>
      <aside className="guide-demo-instructions" aria-label="演示操作提示"><span className="guide-demo-eyebrow">试一试</span><h3>{scenario.title}</h3><ol>{scenario.steps.map((step, index) => <li key={step}><span aria-hidden="true">{index + 1}</span><p>{step}</p></li>)}</ol><div className="guide-demo-takeaway"><strong>你会看到</strong><p>{scenario.takeaway}</p></div></aside>
    </div>
  </div>
}
