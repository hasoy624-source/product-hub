import { ApiError, previewApi } from './preview'
import { previewProjectFiles,previewFileBlob,storeProjectFile,validateProjectFile } from './project-files'
import type { ProjectDetails,ProjectFile } from './types'
import { fetchSalesDataset } from './sales-lifecycle-model'
import {previewSalesPrices} from './sales-conclusions-model'

export { ApiError, publishedPreviewEnabled } from './preview'
export async function uploadProjectFile(projectId:string,nodeId:string,file:File):Promise<ProjectFile>{
  validateProjectFile(file)
  if(import.meta.env.VITE_PREVIEW_MODE==='true'){
    const details=await previewApi<ProjectDetails>(`/projects/${projectId}/details`)
    if(!details.milestones.some(node=>node.id===nodeId))throw new ApiError('项目节点不存在',404)
    return storeProjectFile(projectId,nodeId,file)
  }
  const response=await fetch(`/api/projects/${projectId}/milestones/${nodeId}/files?name=${encodeURIComponent(file.name)}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':file.type||'application/octet-stream'},body:file})
  const result=await response.json().catch(()=>null)
  if(!response.ok)throw new ApiError(result?.detail||'文件上传失败',response.status)
  return result
}
export async function projectFileDownloadURL(file:ProjectFile){
  return import.meta.env.VITE_PREVIEW_MODE==='true'?URL.createObjectURL(await previewFileBlob(file)):`/api/projects/${file.project_id}/milestones/${file.milestone_id}/files/${file.id}`
}
export async function uploadProjectImage(projectId: string, file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new ApiError('请选择 PNG、JPEG 或 WebP 图片', 422)
  if (file.size > 10 * 1024 * 1024) throw new ApiError('图片应小于 10 MB', 413)
  if (import.meta.env.VITE_PREVIEW_MODE === 'true') {
    const url = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file) })
    return previewApi(`/projects/${projectId}/images`, 'POST', { url, caption: file.name.slice(0, 200) })
  }
  const response = await fetch(`/api/projects/${projectId}/images`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type }, body: file })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(result?.detail || '图片上传失败', response.status)
  return result
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (import.meta.env.VITE_PREVIEW_MODE === 'true') {
    if(path==='/sales-lifecycle'&&method==='GET')return await fetchSalesDataset(import.meta.env.BASE_URL) as T
    if(path==='/sales-prices'||path.startsWith('/sales-prices/')){
      const data=await fetchSalesDataset(import.meta.env.BASE_URL)
      if(!data)throw new ApiError('销量数据尚未导入',404)
      return previewSalesPrices(path,method,body,data,localStorage) as T
    }
    const result=await previewApi<T>(path,method,body),match=path.match(/^\/projects\/([^/]+)\/details$/)
    return method==='GET'&&match?{...result,files:await previewProjectFiles(match[1])} as T:result
  }
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.detail
    const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((e: {msg?: string; loc?: string[]}) => `${e.loc?.slice(1).join('.') || '输入'}：${e.msg || '格式不正确'}`).join('；') : `请求失败（${response.status}）`
    throw new ApiError(message, response.status)
  }
  return data as T
}
