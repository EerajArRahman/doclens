import { getAuthToken } from 'deepspace'

export async function action<T>(name: string, params: object): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('Sign in again to continue.')
  const response = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  })
  const result = await response.json() as { success?: boolean; error?: string; data: T }
  if (!response.ok || !result.success) throw new Error(result.error ?? 'The request failed. Try again.')
  return result.data
}
