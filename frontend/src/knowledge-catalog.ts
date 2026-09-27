export type Stage = '概念与启动' | '设计与开发' | 'EVT' | 'DVT' | 'MP'
export type KnowledgeTemplate = {
  id: string
  stage: Stage
  activity: string
  title: string
  owner: string
  inputs: string
  focus: string
  gate?: string
}

export const stages: Stage[] = ['概念与启动', '设计与开发', 'EVT', 'DVT', 'MP']

// 以原始研发流程图的「阶段—活动—输出—责任人」列建立索引；同名输出在不同阶段保留独立版本。
export const knowledgeTemplates: KnowledgeTemplate[] = [
  { id: 'c-prd', stage: '概念与启动', activity: '需求', title: '产品需求文档', owner: '产品经理', inputs: '业务、产品、客户需求', focus: '目标用户、使用场景、功能需求、约束与优先级' },
  { id: 'c-id', stage: '概念与启动', activity: 'ID设计', title: 'ID设计图', owner: 'ID', inputs: '产品需求文档', focus: '外观方案、关键尺寸、设计意图与版本比选' },
  { id: 'c-cmf', stage: '概念与启动', activity: 'ID设计', title: 'CMF图纸', owner: 'ID', inputs: '产品需求文档', focus: '颜色、材料、表面工艺及可制造性说明' },
  { id: 'c-feasibility', stage: '概念与启动', activity: '结构性价评估', title: '技术可行性分析报告', owner: '结构工程师', inputs: '产品需求文档、ID设计图、CMF图纸', focus: '结构方案、关键技术风险、验证计划及结论' },
  { id: 'c-stack', stage: '概念与启动', activity: '结构性价评估', title: '结构堆叠图', owner: '结构工程师', inputs: '产品需求文档、ID设计图、CMF图纸', focus: '关键器件空间、装配关系和尺寸冲突' },
  { id: 'c-cost', stage: '概念与启动', activity: '成本评估', title: '关键物料成本表', owner: '采购', inputs: '产品需求文档、ID设计图、可行性分析、初版BOM', focus: '关键物料单价、供应来源、成本目标与假设' },
  { id: 'c-gate1', stage: '概念与启动', activity: 'Gate 1 评审', title: 'Gate 1 输出最终评审结论', owner: '产品经理', inputs: '需求、可行性、ID设计图及物料成本', focus: '是否立项、待关闭问题、责任人与后续动作', gate: 'Gate 1' },

  { id: 'd-master', stage: '设计与开发', activity: '立项前准备', title: '项目总计划', owner: 'PM', inputs: '产品规格书、ID设计图、CMF图纸、可行性分析及结构堆叠图', focus: '阶段里程碑、资源、关键路径与风险' },
  { id: 'd-application', stage: '设计与开发', activity: '立项前准备', title: '项目立项申请表', owner: 'PM', inputs: '产品规格书、可行性分析与项目总计划', focus: '立项背景、目标、预算、团队与审批事项' },
  { id: 'd-approval', stage: '设计与开发', activity: '立项活动', title: '项目立项表', owner: 'PM', inputs: '立项申请、项目总计划', focus: '批准范围、责任分工、计划基线与立项结论' },
  { id: 'd-wbs', stage: '设计与开发', activity: '立项活动', title: 'WBS项目计划', owner: 'PM', inputs: '项目立项表、项目总计划', focus: '工作分解、交付节点、负责人、依赖和截止时间' },
  { id: 'd-structure', stage: '设计与开发', activity: '结构设计', title: '结构2D/3D图纸', owner: '结构工程师', inputs: '产品规格书、ID设计、CMF及立项计划', focus: '结构尺寸、配合、公差、装配与图纸版本' },
  { id: 'd-schematic', stage: '设计与开发', activity: '硬件设计', title: '硬件原理图', owner: '硬件工程师', inputs: '产品规格书、WBS项目计划', focus: '功能电路、接口、电源和元件选型' },
  { id: 'd-layout', stage: '设计与开发', activity: '硬件设计', title: 'PCB Layout设计', owner: '硬件工程师', inputs: '硬件原理图、结构空间约束', focus: '布局布线、关键网络及硬件设计检查' },
  { id: 'd-software', stage: '设计与开发', activity: '软件设计', title: '软件架构图', owner: '软件工程师', inputs: '产品规格书、硬件接口说明', focus: '模块划分、数据流、接口及异常处理' },
  { id: 'd-bom', stage: '设计与开发', activity: '结构/硬件/软件设计', title: '组装BOM表', owner: '研发团队', inputs: '结构图纸、原理图及Layout设计', focus: '料号、规格、用量、版本与替代料' },
  { id: 'd-cost', stage: '设计与开发', activity: '成本核价', title: '初版成本表', owner: '采购', inputs: '核价文件、产品规格书、结构3D及组装BOM', focus: '各物料报价、成本差异与降本建议' },
  { id: 'd-material', stage: '设计与开发', activity: '功能手板打样', title: '物料交付计划', owner: '采购', inputs: '结构3D及打样资料、组装BOM', focus: '打样物料、供应商、预计到料与缺料风险' },
  { id: 'd-sample', stage: '设计与开发', activity: 'E1整机组装', title: 'E1功能样机', owner: '结构工程师 / PIE', inputs: '物料齐套、软件程序', focus: '样机配置、装配记录、序列号与功能状态' },
  { id: 'd-issues', stage: '设计与开发', activity: 'E1整机测试', title: 'E1组装问题点清单', owner: '结构工程师', inputs: 'E1整机样机、产品规格书、测试计划', focus: '问题现象、严重度、责任人、改进与复测结果' },
  { id: 'd-test', stage: '设计与开发', activity: 'E1整机测试', title: '软硬功能测试报告', owner: '测试', inputs: 'E1整机样机、产品规格书、测试用例', focus: '测试范围、结果、失败项与复测结论' },
  { id: 'd-gate2', stage: '设计与开发', activity: 'Gate 2 评审', title: 'Gate 2 输出最终会议结论', owner: 'PM', inputs: '手板测试报告、组装问题清单', focus: '进入开模条件、未关闭问题与行动责任', gate: 'Gate 2' },

  { id: 'e-tooling', stage: 'EVT', activity: '开模申请', title: '开模资料输出', owner: '结构工程师', inputs: '开模申请书、结构2D/3D图纸、组装BOM', focus: '模具需求、图纸版本、交期与工厂交接资料' },
  { id: 'e-price', stage: 'EVT', activity: '开模申请', title: '开厂商成本确认', owner: '结构工程师', inputs: '开模申请、模具方案', focus: '供应商报价、成本差异与确认记录' },
  { id: 'e-dfm', stage: 'EVT', activity: '开模申请 / DFM评审', title: 'DFM制作', owner: '结构工程师', inputs: '结构2D/3D图纸、组装BOM', focus: '制造可行性、风险和修改建议' },
  { id: 'e-schedule', stage: 'EVT', activity: '开模', title: '开模进度计划表', owner: '采购', inputs: 'DFM文件、模具需求与物料清单', focus: '模具节点、责任方、风险及实际完成时间' },
  { id: 'e-t0', stage: 'EVT', activity: '模具T0', title: 'T0试模样品', owner: '采购', inputs: '开模进度计划、物料齐套', focus: '试模批次、样品状态、尺寸和外观记录' },
  { id: 'e-t0-issues', stage: 'EVT', activity: 'T0样机组装', title: 'T0组装问题点清单', owner: '结构工程师 / PIE', inputs: 'T0整机物料齐套', focus: '组装异常、根因、改模建议与责任人' },
  { id: 'e-revision', stage: 'EVT', activity: '结构设计修改', title: '修订结构3D图纸', owner: '结构工程师', inputs: '组装问题清单', focus: '变更点、图纸版本、影响范围与确认' },
  { id: 'e-review', stage: 'EVT', activity: '初回问题及设计评审', title: '初回问题会议结论', owner: 'PM', inputs: '问题清单、修订结构3D', focus: '评审结论、待办项、责任人与再评审条件' },
  { id: 'e-t1-plan', stage: 'EVT', activity: 'T1修模', title: '修模进度计划', owner: '采购', inputs: '结构2D/3D修模资料、DFM图纸', focus: '修模项目、期限、供应商与验证方式' },
  { id: 'e-t1', stage: 'EVT', activity: 'T1修模', title: 'T1试模样品', owner: '采购', inputs: '修模进度计划', focus: '试模批次、关键尺寸与缺陷改善情况' },
  { id: 'e-t1-issues', stage: 'EVT', activity: 'T1样机验证 / 测试', title: 'T1组装问题报告', owner: '结构工程师', inputs: 'T1样机及验证物料齐套', focus: '问题关闭率、遗留风险及复验结果' },
  { id: 'e-t1-test', stage: 'EVT', activity: 'T1样机验证 / 测试', title: 'T1测试报告', owner: '测试', inputs: 'T1样机、测试用例', focus: '功能和可靠性测试结果及失败项' },
  { id: 'e-review2', stage: 'EVT', activity: '样机检讨评审', title: '样机问题评审结论', owner: 'PM', inputs: '样机组装报告、测试报告', focus: '问题处置、遗留风险及进入DVT判断' },
  { id: 'e-dvt', stage: 'EVT', activity: '样机检讨评审', title: 'DVT试产备料决议', owner: 'PM', inputs: '样机问题评审结论', focus: '试产范围、备料数量、负责人和条件' },

  { id: 'v-plan', stage: 'DVT', activity: 'DVT试产物料备料', title: '试产物料计划表', owner: '采购', inputs: '2D图纸、临时签样样品、BOM、测试报告', focus: '试产清单、数量、交付日期及缺料风险' },
  { id: 'v-material', stage: 'DVT', activity: 'DVT试产物料备料', title: '试产物料齐套', owner: '采购', inputs: '试产物料计划表', focus: '物料齐套率、异常物料和替代确认' },
  { id: 'v-issues', stage: 'DVT', activity: 'DVT试产', title: '试产问题点清单', owner: 'PIE / 品质', inputs: '产品规格书、试产物料标准、工装治具', focus: '问题编号、工位、严重度、根因与关闭证据' },
  { id: 'v-reliability', stage: 'DVT', activity: '测试', title: '可靠性测试报告', owner: '测试', inputs: '测试用例、测试计划、测试样机', focus: '可靠性项目、样本量、条件、数据与结论' },
  { id: 'v-function', stage: 'DVT', activity: '测试', title: '软硬件测试报告', owner: '测试', inputs: '测试用例、测试计划、测试样机', focus: '功能覆盖、软件版本、失效项与回归' },
  { id: 'v-us', stage: 'DVT', activity: '美国团队测试', title: '海外团队测试报告', owner: '业务', inputs: '产品规格书、样机、测试工具', focus: '使用场景、反馈、问题和建议' },
  { id: 'v-gate3', stage: 'DVT', activity: 'Gate 3 评审', title: '试产问题闭环总结', owner: 'PM', inputs: '试产问题清单、可靠性及软硬件测试报告', focus: '问题关闭、遗留风险与量产前置条件', gate: 'Gate 3' },

  { id: 'm-sample', stage: 'MP', activity: '成品签样', title: '承认样品', owner: '结构工程师', inputs: '产品规格书、测试报告、物料样品', focus: '封样信息、样品版本、签样人与保存位置' },
  { id: 'm-standard', stage: 'MP', activity: '成品签样', title: '验收标准', owner: '结构工程师', inputs: '承认样品、产品规格书', focus: '外观、尺寸、功能和可靠性验收指标' },
  { id: 'm-material', stage: 'MP', activity: '成本核算 / 转量产备货', title: '物料齐套计划', owner: '采购', inputs: '组装BOM清单、承认书', focus: '量产物料、库存、到料日期和风险' },
  { id: 'm-cost', stage: 'MP', activity: '成本核算 / 转量产备货', title: '产品BOM成本核算表（终稿）', owner: '采购 / PMC', inputs: '组装BOM、承认书、供应商报价', focus: '终版料号、价格、损耗与总成本' },
  { id: 'm-order', stage: 'MP', activity: '订单评审', title: '订单需求表', owner: 'PMC', inputs: '内部生产订单信息', focus: '订单数量、交期、物料与产能需求' },
  { id: 'm-order-review', stage: 'MP', activity: '订单评审', title: '订单评审会议结论', owner: 'PMC', inputs: '订单需求表', focus: '交付可行性、差异、责任人和决议' },
  { id: 'm-certification', stage: 'MP', activity: '认证', title: '合规认证报告', owner: '业务', inputs: '检测申请、认证数量清单、包装设计、样机', focus: '认证范围、测试机构、结果和证书编号' },
  { id: 'm-packaging', stage: 'MP', activity: '包装设计', title: '终版包装资料', owner: '包装工程师', inputs: '包装设计需求与验收标准', focus: '刀模、印刷、标识、物料规格与版本' },
  { id: 'm-first-issues', stage: 'MP', activity: '量产上线', title: '首量组装问题点报告', owner: 'PIE', inputs: '验收标准、生产工装治具、SOP、SIP', focus: '首件及首批问题、临时措施与永久改善' },
  { id: 'm-first-test', stage: 'MP', activity: '量产上线', title: '首量测试报告', owner: 'PIE', inputs: '验收标准、SOP、SIP', focus: '首批抽检、功能测试和质量结论' },
  { id: 'm-gate4-transfer', stage: 'MP', activity: 'Gate 4 评审', title: '正式移交清单（签字）', owner: 'PIE', inputs: '验收标准、首量组装报告、测试报告', focus: '移交资料、接收方、未结事项与签收', gate: 'Gate 4' },
  { id: 'm-gate4-summary', stage: 'MP', activity: 'Gate 4 评审', title: '项目总结报告', owner: 'PIE', inputs: '正式移交清单、首量组装报告及测试报告', focus: '目标达成、成本质量交期、经验教训', gate: 'Gate 4' },
]

function workingSection(template: KnowledgeTemplate) {
  const title = template.title
  if (template.gate || /评审|会议结论|决议/.test(title)) return '## 评审议题与决议\n\n| 议题 | 依据/证据 | 结论 | 待办与责任人 |\n| --- | --- | --- | --- |\n| 待填写 | 待补充 | 待评审 | 待指定 |\n\n### 进入下一阶段的条件\n\n- [ ] 必要交付物已核对。\n- [ ] 遗留风险已明确责任人和期限。\n'
  if (/测试|验证|可靠性/.test(title)) return '## 测试范围与结果\n\n| 测试项/用例 | 样机与版本 | 验收标准 | 实测结果 | 结论 |\n| --- | --- | --- | --- | --- |\n| 待填写 | 待填写 | 待填写 | 待填写 | 待验证 |\n\n### 失败项与复测\n\n记录问题编号、复测条件和关闭证据。\n'
  if (/BOM|成本|物料/.test(title)) return '## 物料与成本明细\n\n| 料号/项目 | 规格 | 数量 | 单价 | 金额/状态 | 来源 |\n| --- | --- | ---: | ---: | --- | --- |\n| 待填写 | 待填写 | 0 | 待核价 | 待确认 | 待填写 |\n\n### 差异与风险\n\n记录缺料、替代料和成本变动。\n'
  if (/计划|WBS|进度/.test(title)) return '## 里程碑与任务\n\n| 工作项/里程碑 | 负责人 | 计划日期 | 实际日期 | 状态 | 依赖 |\n| --- | --- | --- | --- | --- | --- |\n| 待填写 | 待指定 | 待填写 | — | 未开始 | — |\n'
  if (/问题/.test(title)) return '## 问题跟踪\n\n| 编号 | 现象 | 严重度 | 根因 | 责任人 | 措施 | 复核证据 |\n| --- | --- | --- | --- | --- | --- | --- |\n| 1 | 待填写 | 待定 | 待分析 | 待指定 | 待制定 | 待验证 |\n'
  if (/图纸|设计|架构|DFM/.test(title)) return '## 设计内容与版本\n\n| 模块/图号 | 设计依据 | 关键尺寸/接口 | 版本 | 评审意见 |\n| --- | --- | --- | --- | --- |\n| 待填写 | 待填写 | 待填写 | V0.1 | 待评审 |\n\n### 附件索引\n\n填写图纸、源文件或评审记录的实际存储位置。\n'
  return '## 交付记录\n\n| 事项 | 内容/证据 | 责任人 | 完成状态 |\n| --- | --- | --- | --- |\n| 待填写 | 待填写 | 待指定 | 待确认 |\n'
}

export function starterDocument(template: KnowledgeTemplate, projectName = '') {
  return `# ${template.title}\n\n- 研发阶段：${template.stage}\n- 流程活动：${template.activity}\n- 对应项目：${projectName || '通用模板'}\n- 建议责任人：${template.owner}\n- 流程输入：${template.inputs}\n- 关联评审：${template.gate || '—'}\n\n## 文档目标\n\n${template.focus}。\n\n${workingSection(template)}\n## 交付检查\n\n- [ ] 补充实际数据、图纸或结论。\n- [ ] 记录版本、日期和责任人。\n- [ ] 核对与上游输入的一致性。\n\n## 问题与风险\n\n| 编号 | 问题/风险 | 责任人 | 截止时间 | 处理状态 |\n| --- | --- | --- | --- | --- |\n| 1 | 待填写 | 待指定 | 待填写 | 待跟进 |\n\n## 评审/确认结论\n\n待填写。本知识库记录不代替正式签核。\n\n## 版本记录\n\n| 版本 | 日期 | 修改说明 | 修改人 |\n| --- | --- | --- | --- |\n| V0.1 | 待填写 | 创建草稿 | 待填写 |\n`
}
