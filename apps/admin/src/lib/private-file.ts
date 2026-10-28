import { useQuery } from '@tanstack/react-query'
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

/** A private API image (payment slip, QR) as an object URL for an <img>, fetched with the admin token. */
export function usePrivateImage(path: string | null) {
  return useQuery({
    queryKey: ['admin', 'private-image', path],
    enabled: path !== null,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return URL.createObjectURL(await res.blob())
    },
  })
}
