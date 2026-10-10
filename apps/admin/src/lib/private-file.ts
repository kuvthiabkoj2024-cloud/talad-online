import { getToken } from './api'

/** Private API files (KYC documents, payment slips) need the session: fetch, then open in a new tab. */
export async function openPrivateFile(path: string): Promise<void> {
  const tab = window.open('', '_blank')
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok || !tab) {
    tab?.close()
    return
  }
  tab.location.href = URL.createObjectURL(await res.blob())
}

/** Downloads a CSV (or any file) the API serves to signed-in admins. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } })
  if (!res.ok) throw new Error(String(res.status))
  const a = document.createElement('a')
  a.href = URL.createObjectURL(await res.blob())
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
