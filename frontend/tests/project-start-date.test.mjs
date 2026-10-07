import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { projectBody, validateProjectDates } from '../src/project-native.ts'
import { previewApi, resetPreview } from '../src/preview.ts'
import { restoredWorkbookColumns, defaultWorkbookColumns } from '../src/project-workbook-model.ts'

test('project date validation preserves optional dates and rejects invalid merged ranges',()=>{
  assert.equal(projectBody({name:'项目',start_date:'2026-09-01',due_date:'2026-10-30'}).start_date,'2026-09-01')
  assert.doesNotThrow(()=>validateProjectDates({start_date:'',due_date:''}))
  for(const value of [{start_date:'2026-02-30'},{start_date:'2026-10-15',due_date:'2026-10-01'},{start_date:null}])assert.throws(()=>validateProjectDates(value))
})

test('legacy column preferences gain start dates while v2 user-hidden dates stay hidden',()=>{
  assert.ok(defaultWorkbookColumns.includes('start'))
  assert.deepEqual(restoredWorkbookColumns(['code','node','deadline']),['code','node','deadline','start'])
  assert.deepEqual(restoredWorkbookColumns({version:2,columns:['code','node','deadline']}),['code','node','deadline'])
  assert.deepEqual(restoredWorkbookColumns(null),defaultWorkbookColumns)
})

test('all project surfaces include overall and node start dates',()=>{
  const source=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8')
  assert.ok(source('App.tsx').includes("projects: ['name', 'stage', 'start_date', 'due_date']"))
  assert.ok(source('ProjectWorkspace.tsx').includes('project.start_date'))
  const book=source('ProjectWorkbook.tsx')
  assert.ok(book.includes('开始日期 {project.start_date'))
  assert.ok(book.includes("column.key==='start'"))
  assert.ok(book.includes('workbook-new-start'))
})

test('preview project and node starts persist independently with atomic date validation',async()=>{
  const values=new Map();globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};resetPreview()
  const old=(await previewApi('/workspace')).projects[0];assert.equal(old.start_date,'')
  const project=await previewApi('/projects','POST',{name:'日期测试',start_date:'2026-09-01',due_date:'2026-10-30'})
  await previewApi('/projects/'+project.id,'PATCH',{owner:'林工'})
  assert.equal((await previewApi('/workspace')).projects.find(row=>row.id===project.id).start_date,'2026-09-01')
  await assert.rejects(()=>previewApi('/projects/'+project.id,'PATCH',{start_date:'2026-11-01',owner:'错误修改'}),{status:422})
  await assert.rejects(()=>previewApi('/projects/'+project.id,'PATCH',{due_date:'2026-08-01'}),{status:422})
  assert.equal((await previewApi('/workspace')).projects.find(row=>row.id===project.id).owner,'林工')
  const node=await previewApi(`/projects/${project.id}/milestones`,'POST',{name:'ID设计',planned_start:'2026-09-10',planned_end:'2026-09-20'})
  await previewApi(`/projects/${project.id}/milestones/${node.id}`,'PATCH',{planned_start:'2026-09-11'})
  assert.equal((await previewApi(`/projects/${project.id}/details`)).milestones[0].planned_start,'2026-09-11')
  assert.equal((await previewApi('/workspace')).projects.find(row=>row.id===project.id).start_date,'2026-09-01')
})
