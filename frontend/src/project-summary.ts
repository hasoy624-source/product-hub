import type { Project } from './types'

export type DeadlineSort = 'original' | 'asc' | 'desc'
export function summaryProjects(projects:Project[],stage='all',sort:DeadlineSort='original') {
  const rows=projects.filter(project=>stage==='all'||project.stage===stage)
  if(sort==='original')return rows
  return [...rows].sort((a,b)=>{
    if(!a.due_date&&!b.due_date)return a.name.localeCompare(b.name,'zh-CN')
    if(!a.due_date)return 1
    if(!b.due_date)return -1
    return (sort==='asc'?1:-1)*a.due_date.localeCompare(b.due_date)||a.name.localeCompare(b.name,'zh-CN')
  })
}
export function summaryDeadline(project:Project,today:string) {
  if(!project.due_date)return {text:'未设置',tone:'missing',hint:'截止日期未设置'}
  if(['已完成','已终止'].includes(project.status))return {text:project.due_date,tone:'normal',hint:project.due_date}
  const days=Math.round((Date.parse(project.due_date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000)
  return {text:project.due_date,tone:days<0?'overdue':days<=3?'soon':'normal',hint:days<0?`已逾期 ${-days} 天`:days===0?'今天截止':days<=3?`剩余 ${days} 天`:project.due_date}
}
