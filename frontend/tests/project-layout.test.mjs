import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { summaryDeadline, summaryProjects } from '../src/project-summary.ts'

const source=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8')

test('default project page is a three-column summary with detailed records behind a closed drawer',()=>{
  const app=source('App.tsx'),list=source('ProjectSummaryList.tsx')
  assert.ok(app.includes('<ProjectSummaryList'))
  assert.ok(app.includes('projectDetailOpen&&activeProject&&<ProjectDetailsDrawer'))
  assert.ok(app.includes('const [projectDetailOpen, setProjectDetailOpen] = useState(false)'))
  assert.equal(app.includes('<ProjectNavigator'),false)
  assert.equal((list.match(/<th scope="col"/g)||[]).length,3)
  for(const label of ['项目</th>','当前阶段</th>','截止日期','kind="stage"'])assert.ok(list.includes(label))
  for(const text of ['project.owner','project.progress','priority','openTasks','产品示意图'])assert.equal(list.includes(text),false)
  assert.ok(app.includes("projects: ['name', 'stage', 'due_date']"))
})

test('summary scrolling, mobile widths and optional original detail functions are retained',()=>{
  const css=source('project-simple.css'),details=source('ProjectWorkspace.tsx'),drawer=source('ProjectDetailsDrawer.tsx')
  assert.match(css,/\.simple-project-scroll\{[^}]*overflow:auto[^}]*overscroll-behavior:contain/)
  assert.match(css,/\.simple-project-table thead th\{[^}]*position:sticky;top:0/)
  assert.ok(css.includes('min-width:0')&&css.includes('@media(max-width:600px)'))
  for(const text of ['概况','节点计划','问题与任务','项目动态','onEditProject','onDocuments'])assert.ok(details.includes(text))
  for(const text of ['showModal()','onCancel','关闭项目详细资料','focus({preventScroll:true})'])assert.ok(drawer.includes(text))
})

test('deadline cues preserve missing values and do not falsely flag completed projects',()=>{
  const project={id:'1',name:'P-001',stage:'EVT',due_date:'',status:'正常'}
  assert.equal(summaryDeadline(project,'2026-10-07').text,'未设置')
  assert.equal(summaryDeadline({...project,due_date:'2026-10-01'},'2026-10-07').tone,'overdue')
  assert.equal(summaryDeadline({...project,due_date:'2026-10-01',status:'已完成'},'2026-10-07').tone,'normal')
  assert.equal(summaryDeadline({...project,due_date:'2026-10-01',status:'已终止'},'2026-10-07').tone,'normal')
  assert.equal(summaryDeadline({...project,due_date:'2026-10-07'},'2026-10-07').hint,'今天截止')
  assert.equal(summaryDeadline({...project,due_date:'2026-10-09'},'2026-10-07').tone,'soon')
})

test('summary stage filtering includes completed projects and deadline sorting leaves unknown dates last',()=>{
  const projects=[{id:'a',name:'A',stage:'MP',status:'已完成',due_date:'2026-10-01'},{id:'b',name:'B',stage:'EVT',due_date:''},{id:'c',name:'C',stage:'MP',due_date:'2026-10-10'}]
  assert.equal(summaryProjects(projects,'MP').length,2)
  assert.deepEqual(summaryProjects(projects,'all','asc').map(p=>p.id),['a','c','b'])
  assert.deepEqual(summaryProjects(projects,'all','desc').map(p=>p.id),['c','a','b'])
  assert.deepEqual(projects.map(p=>p.id),['a','b','c'])
  assert.deepEqual(summaryProjects(projects,'all','original'),projects)
})
