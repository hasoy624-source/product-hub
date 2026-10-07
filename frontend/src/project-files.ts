import type { ProjectFile } from './types'
export const maxProjectFileBytes=20*1024*1024
export function validateProjectFile(file:{name:string;size:number}) {
  if(!file.name||file.name.length>200||/[\\/\x00-\x1f\x7f]/.test(file.name)||['.','..'].includes(file.name))throw new Error('文件名格式不正确')
  if(!file.size)throw new Error('请选择非空文件')
  if(file.size>maxProjectFileBytes)throw new Error('单个文件应不超过 20 MB')
}
type StoredFile=ProjectFile&{blob:Blob}
let connection:Promise<IDBDatabase>|undefined
function database(){
  return connection??=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('yingfeite-project-files-v1',1)
    request.onupgradeneeded=()=>{const store=request.result.createObjectStore('files',{keyPath:'id'});store.createIndex('project_id','project_id')}
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>{connection=undefined;reject(new Error('浏览器文件存储开启失败'))}
  })
}
async function records(projectId:string):Promise<StoredFile[]>{
  const db=await database()
  return new Promise((resolve,reject)=>{const request=db.transaction('files').objectStore('files').index('project_id').getAll(projectId);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('读取文件失败'))})
}
export async function previewProjectFiles(projectId:string):Promise<ProjectFile[]>{return (await records(projectId)).map(({blob,...metadata})=>metadata)}
export async function storeProjectFile(projectId:string,nodeId:string,file:File):Promise<ProjectFile>{
  validateProjectFile(file)
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('')
  const db=await database()
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('files','readwrite'),store=transaction.objectStore('files'),request=store.index('project_id').getAll(projectId)
    let metadata:ProjectFile
    request.onsuccess=()=>{
      const rows=request.result as StoredFile[]
      const duplicate=rows.find(row=>row.milestone_id===nodeId&&row.name===file.name&&row.sha256===sha256)
      if(duplicate){const {blob,...value}=duplicate;metadata=value;return}
      if(rows.filter(row=>row.milestone_id===nodeId).length>=30||rows.reduce((sum,row)=>sum+row.size,0)+file.size>200*1024*1024){reject(new Error('节点最多 30 个文件，每个项目文件总量应不超过 200 MB'));transaction.abort();return}
      metadata={id:crypto.randomUUID(),project_id:projectId,milestone_id:nodeId,name:file.name,content_type:file.type||'application/octet-stream',size:file.size,sha256,created_at:new Date().toISOString()}
      store.add({...metadata,blob:file})
    }
    transaction.oncomplete=()=>resolve(metadata)
    transaction.onerror=()=>reject(new Error('文件存储失败，请检查浏览器可用空间'))
    transaction.onabort=()=>reject(new Error('文件存储未完成'))
  })
}
export async function previewFileBlob(file:ProjectFile):Promise<Blob>{
  const row=(await records(file.project_id)).find(row=>row.id===file.id&&row.milestone_id===file.milestone_id)
  if(!row)throw new Error('文件不存在于当前浏览器')
  return row.blob
}
