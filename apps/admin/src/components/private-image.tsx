import { cn } from '@talad/ui/lib/utils'
import { ImageOff, LoaderCircle } from 'lucide-react'
import { usePrivateImage } from '@/lib/private-file'

/** An image behind the admin's sign-in (slips, QR codes), with loading and missing states. */
export function PrivateImage({ path, className }: { path: string; className?: string }) {
  const img = usePrivateImage(path)
  if (img.isPending) return <span className={cn('flex items-center justify-center', className)}><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></span>
  if (!img.data) return <span className={cn('flex items-center justify-center', className)}><ImageOff className="size-6 text-muted-foreground" /></span>
  return <img src={img.data} alt="" className={cn('bg-white', className)} />
}
