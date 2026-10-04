import test from 'node:test'
import assert from 'node:assert/strict'
import { filterProjects, projectOverdue, projectProgressText, searchProjects } from '../src/classification.ts'
import { exceptionDetails } from '../src/exceptions.ts'
const imported = { id: 'real-1', name: 'X-001', owner: '', due_date: '', stage: '待确认', status: '待立项', progress: 0, import_info: { progress_known: false, phase: '预研', priority: 'S+', category: '电池类' } }
test('imported missing dates and progress remain unknown rather than overdue or zero percent', () => {
  const task = { id: 't', project_id: imported.id, due_date: '', status: '待办' }
  assert.equal(projectProgressText(imported), '未录入')
  assert.equal(projectProgressText({...imported, import_info: {...imported.import_info, progress_known: true}}), '0%')
  assert.equal(projectOverdue(imported, [task], '2026-10-04'), false)
  assert.equal(exceptionDetails({projects:[imported], tasks:[task], signals:[]}, '2026-10-04').total, 0)
  assert.equal(projectOverdue({...imported, status:'已终止', due_date:'2025-01-01'}, [], '2026-10-04'), false)
})
test('register search and additional status filters use the real source fields', () => {
  for (const query of ['x-001', '预研', 's+', '电池类']) assert.equal(searchProjects([imported], query).length, 1)
  assert.deepEqual(filterProjects([imported], [], [], 'status:待立项', '2026-10-04'), [imported])
  assert.equal(filterProjects([imported], [], [], 'active', '2026-10-04').length, 0)
})
