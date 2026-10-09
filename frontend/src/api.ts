import { ApiError, previewApi } from './preview'
import { previewProjectFiles,previewFileBlob,storeProjectFile,validateProjectFile } from './project-files'
import type { ProjectDetails,ProjectFile } from './types'
import { fetchSalesDataset } from './sales-lifecycle-model'
import {previewSalesPrices} from './sales-conclusions-model'
import {fetchSalesHistory} from './sales-history-model'
import {maintainedSalesHistory,previewSalesDataApi} from './sales-maintenance-storage'
import {priceCatalog} from './sales-maintenance-model'
import {browserProductTaxonomy,saveBrowserProductTaxonomy,undoBrowserProductTaxonomy} from './product-taxonomy-storage'
import {activateProductTaxonomy,taxonomyPreview,canonicalProductTypeName,canonicalProductDashboard} from './product-taxonomy-model'
import type {Dashboard} from './types'
import type {ProductTaxonomy,ProductTaxonomyView} from './product-taxonomy-model'
import {browserProjectTable,saveBrowserProjectTable} from './project-table-storage'
import type {ProjectTableData} from './project-table-model'

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
    if(path==='/project-table'&&method==='GET')return (await browserProjectTable(import.meta.env.BASE_URL)).view as T
    if(path==='/project-table'&&method==='PUT'){const payload=body as {data:ProjectTableData;revision:string};return await saveBrowserProjectTable(import.meta.env.BASE_URL,payload.data,payload.revision) as T}
    if(path==='/project-table/undo'&&method==='POST'){const current=await browserProjectTable(import.meta.env.BASE_URL);return await saveBrowserProjectTable(import.meta.env.BASE_URL,current.view,(body as {revision:string}).revision,true) as T}
    if(path==='/product-taxonomy'&&method==='GET')return await browserProductTaxonomy() as T
    if(path==='/product-taxonomy'&&method==='PUT'){const payload=body as {config:ProductTaxonomy;revision:string};const result=await saveBrowserProductTaxonomy(payload.config,payload.revision);window.dispatchEvent(new Event('product-taxonomy-changed'));return result as T}
    if(path==='/product-taxonomy/undo'&&method==='POST'){const result=await undoBrowserProductTaxonomy((body as {revision:string}).revision);window.dispatchEvent(new Event('product-taxonomy-changed'));return result as T}
    if(path==='/product-taxonomy/preview'&&method==='POST'){const payload=body as {config:ProductTaxonomy;revision:string},view=await browserProductTaxonomy();if(payload.revision!==view.revision)throw new ApiError('配置已更新，请重新读取并预览',409);const history=await maintainedSalesHistory(await fetchSalesHistory(import.meta.env.BASE_URL)),changes=taxonomyPreview(history.flatMap(data=>data.products.map(row=>({model:row.model,category:row.category,year:data.year}))),payload.config);return {changes,count:changes.length} as T}
    if(['/sales-lifecycle','/sales-history','/sales-prices','/sales-data','/workspace','/dashboard'].some(prefix=>path===prefix||path.startsWith(prefix+'/')||path.startsWith(prefix+'?')))await browserProductTaxonomy()
    if(path==='/sales-lifecycle'&&method==='GET')return await fetchSalesDataset(import.meta.env.BASE_URL) as T
    if(path==='/sales-history'&&method==='GET')return await maintainedSalesHistory(await fetchSalesHistory(import.meta.env.BASE_URL)) as T
    if(path==='/sales-data'||path.startsWith('/sales-data/'))return await previewSalesDataApi(path,method,body,await fetchSalesHistory(import.meta.env.BASE_URL)) as T
    if(path==='/sales-prices'||path.startsWith('/sales-prices/')){
      const history=await maintainedSalesHistory(await fetchSalesHistory(import.meta.env.BASE_URL))
      if(!history.length)throw new ApiError('销量数据尚未导入',404)
      const products=priceCatalog(history)
      return previewSalesPrices(path,method,body,{...history[0],products},localStorage) as T
    }
    let result:T=await previewApi<T>(path,method,body);const match=path.match(/^\/projects\/([^/]+)\/details$/)
    if(path==='/workspace'&&method==='GET'){const workspace=result as {products:{category:string}[]};result={...workspace,products:workspace.products.map(row=>({...row,category:canonicalProductTypeName(row.category)}))} as T}
    if(path.startsWith('/dashboard')&&method==='GET')result=canonicalProductDashboard(result as Dashboard) as T
    return method==='GET'&&match?{...result,files:await previewProjectFiles(match[1])} as T:result
  }
  if(!path.startsWith('/product-taxonomy')&&(['/sales-lifecycle','/sales-history','/sales-data','/sales-prices','/workspace','/dashboard'].some(prefix=>path===prefix||path.startsWith(prefix+'/')||path.startsWith(prefix+'?'))))await api<ProductTaxonomyView>('/product-taxonomy')
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.detail
    const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((e: {msg?: string; loc?: string[]}) => `${e.loc?.slice(1).join('.') || '输入'}：${e.msg || '格式不正确'}`).join('；') : `请求失败（${response.status}）`
    throw new ApiError(message, response.status)
  }
  if(path==='/product-taxonomy'||path==='/product-taxonomy/undo'){activateProductTaxonomy(data);if(method!=='GET')window.dispatchEvent(new Event('product-taxonomy-changed'))}
  if(path==='/workspace'&&method==='GET'&&data?.products)data.products=data.products.map((row:{category:string})=>({...row,category:canonicalProductTypeName(row.category)}))
  if(path.startsWith('/dashboard')&&method==='GET')return canonicalProductDashboard(data) as T
  return data as T
}
