import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateProjectFile,maxProjectFileBytes} from '../src/project-files.ts'
import {exceptionHref,projectSheetHref,projectRoute} from '../src/project-links.ts'
import {filterProjects} from '../src/classification.ts'

test('file validation applies equal filename and size rules before storage',()=>{
  assert.doesNotThrow(()=>validateProjectFile({name:'PRD.xlsx',size:maxProjectFileBytes}))
  for(const value of [{name:'../file',size:1},{name:'bad\nname',size:1},{name:'empty',size:0},{name:'big',size:maxProjectFileBytes+1}])assert.throws(()=>validateProjectFile(value))
})
test('exception links enter corresponding project tables and preserve explicit project targeting',()=>{
  assert.deepEqual(projectRoute(exceptionHref('projects')),{filter:'status:风险',projectId:''})
  assert.deepEqual(projectRoute(exceptionHref('tasks')),{filter:'attention:tasks',projectId:''})
  assert.deepEqual(projectRoute(projectSheetHref('project-2')),{filter:'all',projectId:'project-2'})
  assert.equal(exceptionHref('signals'),'#signals')
  assert.equal(projectRoute('#signals'),null)
})
test('overdue-task project filtering is not the unrelated project deadline filter',()=>{
  const projects=[{id:'a',status:'正常',due_date:'2026-01-01'},{id:'b',status:'风险',due_date:''},{id:'c',status:'正常',due_date:''}]
  const tasks=[{project_id:'c',status:'待办',due_date:'2026-10-01'},{project_id:'a',status:'已完成',due_date:'2026-10-01'}]
  assert.deepEqual(filterProjects(projects,tasks,[],'attention:tasks','2026-10-07').map(p=>p.id),['c'])
  assert.deepEqual(filterProjects(projects,tasks,[],'attention:projects','2026-10-07').map(p=>p.id),['b','c'])
})
test('related files use upload controls and IndexedDB blobs without changing legacy column keys',()=>{
  const source=file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8')
  assert.ok(source('project-workbook-model.ts').includes("key:'documents',label:'相关文件'"))
  assert.ok(source('ProjectFiles.tsx').includes('type="file" multiple'))
  assert.ok(source('project-files.ts').includes('indexedDB.open')&&source('project-files.ts').includes('blob:file'))
  assert.equal(source('project-files.ts').includes('localStorage'),false)
  assert.ok(source('ProjectWorkbook.tsx').includes('target.getBoundingClientRect()')&&source('ProjectWorkbook.tsx').includes('if(focused)setCollapsed(false)'))
})
