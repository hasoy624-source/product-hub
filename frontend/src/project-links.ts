export function exceptionHref(view:string){
  return view==='projects'?'#projects?attention=risk':view==='tasks'?'#projects?attention=tasks':view==='signals'?'#signals':'#projects?attention=exceptions'
}
export function projectSheetHref(id:string){return '#projects?project='+encodeURIComponent(id)}
export function projectRoute(hash:string){
  const [route,query='']=hash.replace(/^#/,'').split('?',2)
  if(route!=='projects')return null
  const params=new URLSearchParams(query),attention=params.get('attention'),id=params.get('project')||''
  return {filter:attention==='risk'?'status:风险':attention==='tasks'?'attention:tasks':attention==='exceptions'?'attention:projects':'all',projectId:id.length<=64?id:''}
}
