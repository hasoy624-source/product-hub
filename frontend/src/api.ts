import { ApiError, previewApi } from './preview'

export { ApiError }
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
