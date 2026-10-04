import type { Workspace } from './types'
import { yuanToCents } from './money.ts'

export const demoToday = '2026-10-04'
export const demoMonth = '2026-10'
export const demoScenarios = [
  { id: 'start', title: '从产品到交付', steps: ['点击流程节点查看对应示例。', '用下一步走完五个环节。', '到业务页面建立自己的记录。'], takeaway: '产品、项目、任务、文档与经营记录各有入口。' },
  { id: 'overview', title: '从异常找到记录', steps: ['点击饼图扇区或分类。', '查看下方对应的示例明细。', '在实际总览中，点击后进入异常明细页。'], takeaway: '总览负责导航，完整信息在对应明细里。' },
  { id: 'exceptions', title: '处理一条逾期任务', steps: ['选择“逾期任务”。', '将示例任务标记为完成。', '检查任务条数和异常总数变化。'], takeaway: '异常由原始记录计算，更新原记录后才会变化。' },
  { id: 'projects', title: '阶段与任务分开维护', steps: ['切换项目阶段观察颜色。', '勾选任务完成状态。', '确认完成任务没有自动切换阶段。'], takeaway: '阶段、进度和任务状态分别由负责人维护。' },
  { id: 'products', title: '筛选品类并录入销售', steps: ['点击品类查看产品与当月金额。', '选择产品，输入 1280.50 元。', '保存示例后检查金额；同一渠道不重复新增。'], takeaway: '品类筛选与月度销售使用同一产品范围。' },
  { id: 'signals', title: '分类与反馈倾向', steps: ['切换情报类型查看筛选。', '修改示例反馈的倾向。', '观察负向记录的异常提示。'], takeaway: '情报类型用于分类，负向倾向用于异常汇总。' },
  { id: 'knowledge', title: '填写阶段输出', steps: ['查看 EVT 示例文档与项目关联。', '补充内容并选择文档状态。', '保存后查看已保存的内容与状态。'], takeaway: '保存文档与变更项目阶段是不同的操作。' },
  { id: 'reports', title: '分类查看报告档案', steps: ['切换报告类型查看示例。', '生成一份所选月示例报告。', '检查生成结果与档案中的月份。'], takeaway: '生成使用所选月份；档案保留其他月份的报告。' },
  { id: 'integrations', title: '维护集成席位', steps: ['填写示例服务名称。', '选择待接入或已停用。', '保存配置，查看席位状态。'], takeaway: '保存席位配置不等于已经连接外部服务。' },
  { id: 'settings', title: '先定义字段，再填记录', steps: ['选择字段类型和显示名称。', '添加定义，查看下方生成的控件。', '填写示例项目的字段值并另行保存。'], takeaway: '字段定义和每条记录的字段值需要分别保存。' },
  { id: 'colors', title: '读懂颜色所在的维度', steps: ['切换阶段观察标签与进度色。', '对照品类和任务状态标签。', '始终结合标签文字判断含义。'], takeaway: '颜色辅助识别；阶段、品类、状态不是同一维度。' },
  { id: 'data', title: '保存与重新读取', steps: ['修改示例名称但先不保存。', '点击模拟重新读取，查看已保存版本。', '再次修改并保存，再模拟重新读取。'], takeaway: '重新读取不会替你保存未提交的编辑。' },
] as const

// Fresh in-memory records on every reset; no shared business or browser state.
export function createDemoWorkspace(): Workspace {
  return {
    products: [
      { id: 'demo-battery', name: '示例·多功能切膏刀', sku: 'DEMO-B01', category: '电池类', status: '在售', owner: '示例负责人', description: '' },
      { id: 'demo-dry', name: '示例·干烧雾化器', sku: 'DEMO-D01', category: '干烧类', status: '研发中', owner: '示例负责人', description: '' },
      { id: 'demo-accessory', name: '示例·替换配件', sku: 'DEMO-A01', category: '配件类', status: '在售', owner: '示例负责人', description: '' },
    ],
    sales: [{ id: 'demo-sale', product_id: 'demo-accessory', month: demoMonth, revenue_cents: 36000, units: 12, channel: '示例渠道', note: '' }],
    projects: [{ id: 'demo-project', name: '示例·切膏刀研发', product_id: 'demo-battery', stage: 'EVT', status: '风险', owner: '示例负责人', due_date: '2026-10-20', progress: 55, description: '' }],
    tasks: [
      { id: 'demo-task', project_id: 'demo-project', title: '完成样机验证', owner: '示例负责人', due_date: '2026-10-01', status: '进行中' },
      { id: 'demo-task-next', project_id: 'demo-project', title: '整理验证报告', owner: '示例负责人', due_date: '2026-10-08', status: '待办' },
    ],
    signals: [
      { id: 'demo-feedback', kind: '市场反馈', brand: '示例产品', title: '续航体验待改善', content: '样例用户反馈连续使用时间偏短。', sentiment: '负向', source_url: '', occurred_on: '2026-10-02' },
      { id: 'demo-competitor', kind: '竞品动态', brand: '示例竞品', title: '发布新款便携配件', content: '样例竞品新增便携配件。', sentiment: '中性', source_url: '', occurred_on: '2026-10-03' },
    ],
    seats: [], jobs: [], reports: [], knowledge_documents: [], categories: [], custom_fields: [], entity_meta: [], activity: [],
  }
}

export function completeDemoTask(workspace: Workspace, id: string, completed: boolean): Workspace {
  return { ...workspace, tasks: workspace.tasks.map(task => task.id === id ? { ...task, status: completed ? '已完成' : '进行中' } : task) }
}

export function recordDemoSale(workspace: Workspace, productId: string, amount: string): Workspace {
  if (!workspace.products.some(product => product.id === productId)) throw new Error('请选择有效产品')
  if (workspace.sales.some(sale => sale.product_id === productId && sale.month === demoMonth && sale.channel === '示例渠道')) throw new Error('同一产品、月份与渠道已有记录，请在实际页面编辑原记录')
  const revenue = yuanToCents(amount)
  return { ...workspace, sales: [...workspace.sales, { id: `demo-sale-${productId}`, product_id: productId, month: demoMonth, revenue_cents: revenue, units: 12, channel: '示例渠道', note: '' }] }
}
