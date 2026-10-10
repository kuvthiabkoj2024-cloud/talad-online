import { Button } from '@talad/ui/components/button'
import { SearchX } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState, FullScreen } from '@/components/states'
import { useI18n } from '@/i18n/context'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <FullScreen>
      <EmptyState
        icon={SearchX}
        title={t.common.notFound}
        className="w-full max-w-md"
        action={
          <Button asChild variant="outline">
            <Link to="/">{t.common.backHome}</Link>
          </Button>
        }
      />
    </FullScreen>
  )
}
