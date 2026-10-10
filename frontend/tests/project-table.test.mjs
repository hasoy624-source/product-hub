import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateProjectTable,filterProjectTable,replaceProjectRow,publicProjectFields,projectTableProgress,projectTableStageTone,expandedProjectTable,projectStageTabs,projectTableColumns,defaultProjectTableColumns} from '../src/project-table-model.ts'
const load=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'))
const base=load('../public/project-table/current.json')
test('authorized public table preserves 30 project rows and contains only four approved business fields',()=>{
  const valid=validateProjectTable(base);assert.equal(valid.rows.length,30);assert.deepEqual(valid.fields,[...publicProjectFields]);assert.equal(valid.rows[0].progress,90);assert.equal(valid.rows[0].completion_time,'待客户反馈');assert.equal(valid.rows.filter(row=>!row.stage).length,7);assert.equal(valid.rows.filter(row=>row.progress===null).length,12)
  for(const row of valid.rows)assert.deepEqual(Object.keys(row).sort(),['id',...publicProjectFields].sort())
  assert.equal(projectTableProgress(null),'未录入');assert.equal(projectTableProgress(0),'0%');assert.equal(projectTableProgress(100),'100%');assert.notEqual(projectTableStageTone('PVT'),projectTableStageTone('DVT'))
})
test('project table filters and native edits retain missing values and leave sales snapshots unchanged',()=>{
  const before=JSON.stringify(base);assert.equal(filterProjectTable(base.rows,'unset','').length,7);assert.equal(filterProjectTable(base.rows,'active','').length,17);assert.equal(filterProjectTable(base.rows,'research','').length,6)
  const row={...base.rows[0],stage:'新验证阶段',progress:0},next=replaceProjectRow(base,row);assert.equal(next.rows[0].stage,'新验证阶段');assert.equal(next.rows[0].progress,0);assert.equal(JSON.stringify(base),before)
  for(const [name,total] of [['lifecycle.json',2280143],['lifecycle-2025.json',3039874]])assert.equal(load('../public/sales/'+name).monthly_totals.reduce((a,b)=>a+(b??0),0),total)
})
test('validation and import projection reject invalid progress and strip private fields from public records',()=>{
  let value=structuredClone(base);value.rows[0].progress=101;assert.throws(()=>validateProjectTable(value));value=structuredClone(base);value.rows[0].name=value.rows[1].name;assert.throws(()=>validateProjectTable(value))
  value=structuredClone(base);value.rows[0].owner='PRIVATE PERSON';value.rows[0].description='PRIVATE ROADMAP';const clean=validateProjectTable(value);assert.equal(clean.rows[0].owner,undefined);assert.equal(clean.rows[0].description,undefined)
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');assert.ok(app.includes('const legacyProjectView=false'));assert.ok(app.includes("route === 'projects' && !legacyProjectView && <ProjectTable/>"));assert.ok(app.includes('compactProjects={!legacyProjectView}'))
})
test('restored workbook columns and phase tabs retain blank editable fields without importing private source data',()=>{
  const value=structuredClone(base);value.rows[0].owner='PRIVATE SOURCE';const view=expandedProjectTable(value)
  assert.equal(view.rows[0].owner,'');assert.equal(view.rows[0].node,'');assert.equal(view.rows[0].deadline,'');assert.equal(view.rows[0].completion_time,'待客户反馈');assert.equal(view.revision,base.revision)
  assert.deepEqual(defaultProjectTableColumns,['name','image','category','owner','node','start_date','deadline','deliverable','files','priority'])
  assert.deepEqual(projectTableColumns.filter(row=>defaultProjectTableColumns.includes(row.key)).map(row=>row.label),['项目编号','产品示意图','项目类别','负责人','项目节点','开始日期','截止日期','输出产物','相关文件','优先级'])
  const tabs=projectStageTabs(view.rows);assert.equal(tabs.find(row=>row.id==='PVT').count,7);assert.equal(tabs.find(row=>row.id==='EVT').count,2);assert.equal(tabs.find(row=>row.id==='预研').count,6);assert.equal(tabs.find(row=>row.id==='unset').count,7);assert.equal(tabs.find(row=>row.id==='概念与启动').count,0)
  const next=replaceProjectRow(view,{...view.rows[0],owner:'测试负责人',category:'配件类',node:'ID 设计',start_date:'2026-10-01',deadline:'2026-10-31',deliverable:'PRD',priority:'S+'});assert.equal(next.rows[0].node,'ID 设计');assert.equal(next.rows[0].owner,'测试负责人');assert.equal(value.rows[0].owner,'PRIVATE SOURCE')
  assert.throws(()=>replaceProjectRow(next,{...next.rows[0],start_date:'2026-12-01'}))
})
