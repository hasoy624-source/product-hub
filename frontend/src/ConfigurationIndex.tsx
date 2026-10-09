const modules=[
  {name:'产品与销售',href:'#products',items:'产品档案、参考售价、月合计、Excel 导入、备份与撤销',mode:'页面维护；产品类型在当前页管理'},
  {name:'研发项目',href:'#projects',items:'原生项目表、阶段、进度、完成时间、搜索、备份与撤销',mode:'页面维护；公开预览四字段，本地完整表十字段；旧节点视图隐藏'},
  {name:'流程知识库',href:'#knowledge',items:'项目阶段输出内容、责任人、状态、Markdown 导入导出',mode:'页面维护；现有流程模板目录为预设'},
  {name:'报告与任务',href:'#reports',items:'报告类型、自定义字段、按月生成报告、任务启停与频率',mode:'页面维护；报告计算逻辑使用既有规则'},
  {name:'市场情报',href:'#signals',items:'人工情报、评价筛选；正式后端可新增/编辑采集站点',mode:'GitHub 预览采集由后台任务运行；新站点解析适配是工程工作'},
  {name:'集成计划',href:'#integrations',items:'服务名称、提供方、接入目的与状态',mode:'页面维护接入记录；实际密钥与服务连接由后台配置'},
]
export default function ConfigurationIndex(){return <section className="configuration-index"><h2>各板块操作入口</h2><p>业务记录和已开放配置由页面维护；这里区分操作入口与预设业务逻辑。</p>{modules.map(row=><div key={row.href}><a href={row.href}>{row.name} →</a><span>{row.items}</span><small>{row.mode}</small></div>)}<p>当前预览保存到本浏览器；多人共同维护采用同一正式后端与数据库。账号权限、服务器部署及全新业务算法属于后台能力，不把接入计划记录当作已连接服务。</p></section>}
