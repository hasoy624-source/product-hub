import { ApiError, previewApi } from './preview'

export { ApiError, publishedPreviewEnabled } from './preview'
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
  if (import.meta.env.VITE_PREVIEW_MODE === 'true') return previewApi<T>(path, method, body)
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.detail
    const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((e: {msg?: string; loc?: string[]}) => `${e.loc?.slice(1).join('.') || '输入'}：${e.msg || '格式不正确'}`).join('；') : `请求失败（${response.status}）`
    throw new ApiError(message, response.status)
  }
  return data as T
}
