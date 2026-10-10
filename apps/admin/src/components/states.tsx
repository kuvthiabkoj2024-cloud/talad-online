import { Button } from '@talad/ui/components/button'
import { cn } from '@talad/ui/lib/utils'
import { LoaderCircle, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useI18n } from '@/i18n/context'

/** Centered icon + message, for empty lists and dead ends. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  body?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card px-6 py-12 text-center', className)}>
      <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-brand-soft text-primary">
        <Icon className="size-6" />
      </span>
      <h3 className="font-semibold">{title}</h3>
      {body && <p className="max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function LoadingState({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground', className)}>
      <LoaderCircle className="size-4 animate-spin" />
      {t.common.loading}
    </div>
  )
}

export function ErrorState({ onRetry, className }: { onRetry: () => void; className?: string }) {
  const { t } = useI18n()
  return (
    <EmptyState
      icon={TriangleAlert}
      title={t.common.loadError}
      className={className}
      action={
        <Button variant="outline" onClick={onRetry}>
          {t.common.retry}
        </Button>
      }
    />
  )
}

/** Whole-screen card (sign-in problems, splash). */
export function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">{children}</div>
}
