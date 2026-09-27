export class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status } }
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = data?.detail
    const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map((e: {msg?: string; loc?: string[]}) => `${e.loc?.slice(1).join('.') || '输入'}：${e.msg || '格式不正确'}`).join('；') : `请求失败（${response.status}）`
    throw new ApiError(message, response.status)
  }
  return data as T
}
