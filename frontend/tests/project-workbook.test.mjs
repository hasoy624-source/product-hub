import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { projectWorkbookGroups, linkedNodeDocuments, workbookCategory, workbookColumns, defaultWorkbookColumns, nextWorkbookLimit } from '../src/project-workbook-model.ts'
import { previewApi, resetPreview } from '../src/preview.ts'

test('project sheets start collapsed and retain accessible manual expansion',()=>{
  const source=readFileSync(new URL('../src/ProjectWorkbook.tsx',import.meta.url),'utf8')
  assert.match(source,/const \[collapsed,setCollapsed\]=useState\(true\)/)
  assert.match(source,/onClick=\{\(\)=>setCollapsed\(!collapsed\)\}/)
  assert.match(source,/aria-expanded=\{!collapsed\}/)
  assert.match(source,/\{!collapsed&&<>/)
})

test('scroll batches stop at the actual project count, including short and empty stages',()=>{
  assert.equal(nextWorkbookLimit(8,119),16)
  assert.equal(nextWorkbookLimit(112,119),119)
  assert.equal(nextWorkbookLimit(119,119),119)
  assert.equal(nextWorkbookLimit(8,2),2)
  assert.equal(nextWorkbookLimit(8,0),0)
})

test('workbook auto-loads within its scroll area and removes the manual more button',()=>{
  const source=readFileSync(new URL('../src/ProjectWorkbook.tsx',import.meta.url),'utf8')
  assert.match(source,/new IntersectionObserver/)
  assert.match(source,/root:scroll.current/)
  assert.match(source,/observer.observe\(loadMore.current\)/)
  assert.match(source,/observer.disconnect\(\)/)
  assert.match(source,/setLimit\(workbookPageSize\);scroll.current\?\.scrollTo\(\{top:0\}\)/)
  assert.match(source,/className="workbook-load-sentinel" style=\{\{width:sheetWidth\}\}/)
  assert.equal(source.includes('继续显示'),false)
})

test('stage workbook groups existing projects without inventing gates or nodes',()=>{
  const projects=[{id:'a',stage:'EVT'},{id:'b',stage:'概念与启动'},{id:'c',stage:'EVT',status:'已完成'}]
  const groups=projectWorkbookGroups(projects)
  assert.equal(groups.length,2);assert.equal(groups[0].projects.length,2)
  assert.equal(projectWorkbookGroups(projects,'概念与启动')[0].title,'概念与启动阶段（Gate 1）')
  assert.ok(defaultWorkbookColumns.includes('deadline'))
  assert.ok(workbookColumns.some(c=>c.key==='image'))
  assert.ok(workbookColumns.some(c=>c.key==='documents'))
})

test('related documents are scoped to an explicit node link and current project',()=>{
  const workspace={knowledge_documents:[{id:'d1',project_id:'p1',title:'PRD'},{id:'d2',project_id:'p2',title:'Other'}],entity_meta:[{scope:'project',entity_id:'p1',category_id:'c1'}],categories:[{id:'c1',name:'电池类'}]}
  assert.equal(linkedNodeDocuments(workspace,'p1',{document_ids:[]}).length,0)
  assert.deepEqual(linkedNodeDocuments(workspace,'p1',{document_ids:['d1','d2']}),[workspace.knowledge_documents[0]])
  assert.equal(workbookCategory(workspace,'p1'),'电池类')
})

test('preview workbook cells persist node outputs, priority, date and valid document links',async()=>{
  const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};resetPreview()
  const workspace=await previewApi('/workspace');const project=workspace.projects[0]
  const doc=await previewApi('/knowledge_documents','POST',{project_id:project.id,template_id:'c-prd',stage:'概念与启动',title:'PRD',owner:'林工',status:'草稿',content:'产品需求'})
  const node=await previewApi(`/projects/${project.id}/milestones`,'POST',{name:'ID设计',deliverable:'CMF',priority:'高',document_ids:[doc.id],planned_end:''})
  await previewApi(`/projects/${project.id}/milestones/${node.id}`,'PATCH',{planned_end:'2026-10-30'})
  const result=(await previewApi(`/projects/${project.id}/details`)).milestones[0]
  assert.equal(result.deliverable,'CMF');assert.equal(result.priority,'高');assert.deepEqual(result.document_ids,[doc.id])
  assert.equal(result.planned_end,'2026-10-30')
  await assert.rejects(()=>previewApi(`/projects/${project.id}/milestones/${node.id}`,'PATCH',{document_ids:['missing']}),{status:422})
  assert.deepEqual((await previewApi(`/projects/${project.id}/details`)).milestones[0].document_ids,[doc.id])
})
