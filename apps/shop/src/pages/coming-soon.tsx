import { Button } from '@talad/ui/components/button'
import { Hourglass } from 'lucide-react'
import { Link } from 'react-router'
import { PageBody, TopBar } from '@/components/page-header'
import { EmptyState } from '@/components/states'
import { useI18n } from '@/i18n/context'
import type { NavItem } from '@/nav'

/** Sections that aren't built yet (orders, finance, …), so links from home and the sidebar still land somewhere. */
export function ComingSoonPage({ item }: { item: NavItem }) {
  const { t } = useI18n()
  return (
    <>
      <TopBar title={t.nav[item.label]} backTo="/" />
      <PageBody>
        <EmptyState
          icon={item.icon ?? Hourglass}
          title={`${t.nav[item.label]} · ${t.common.comingSoon}`}
          body={t.common.comingSoonBody}
          action={
            <Button asChild variant="outline">
              <Link to="/">{t.common.backHome}</Link>
            </Button>
          }
          className="mt-6"
        />
      </PageBody>
    </>
  )
}
