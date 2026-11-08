import { useQuery } from '@tanstack/react-query'
import { getToken } from './api'

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

export interface PrivateFile {
  url: string
  /** MIME type, e.g. image/jpeg or application/pdf. */
  type: string
}

/** A private API file (KYC document, payment slip) as an object URL and its type, fetched with the admin token. */
export function usePrivateFile(path: string | null) {
  return useQuery({
    queryKey: ['admin', 'private-file', path],
    enabled: path !== null,
    staleTime: Infinity,
    queryFn: async (): Promise<PrivateFile> => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      return { url: URL.createObjectURL(blob), type: blob.type || res.headers.get('content-type') || '' }
    },
  })
}
