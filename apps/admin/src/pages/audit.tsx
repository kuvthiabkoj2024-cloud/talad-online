import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { Link } from 'react-router'
import { FilterTabs, Pager } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/format'
import type { AuditEntry, Paged } from '@/lib/types'

const TYPES = ['Shop', 'Product', 'Customer', 'ShopOrder', 'Payout', 'Category', 'Setting', 'AdminUser'] as const

/** Where an audited entity lives in the console, if it has a page. */
function targetHref(e: AuditEntry): string | null {
  if (e.entityType === 'Shop') return `/shops/${e.entityId}`
  if (e.entityType === 'Product') return `/products/${e.entityId}`
  if (e.entityType === 'Customer') return `/customers/${e.entityId}`
  return null
}

/** Every recorded admin action (§2.1). `?type=Shop&page=` */
export function AuditPage() {
  const { t, locale } = useI18n()
  const { params, set, page } = useUrlParams()
  const type = params.get('type') ?? ''
  const query = new URLSearchParams({ page: String(page) })
  if (type) query.set('entityType', type)
  const list = useQuery({
    queryKey: ['admin', 'audit', { type, page }],
    queryFn: () => api<Paged<AuditEntry>>(`/admin/audit-log?${query}`),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <TopBar title={t.audit.title} />
      <PageBody>
        <PageIntro title={t.audit.title} description={t.audit.description} />
        <FilterTabs
          tabs={[{ key: '', label: t.common.all }, ...TYPES.map((k) => ({ key: k, label: k }))]}
          active={type}
          onSelect={(k) => set({ type: k || undefined, page: undefined })}
        />
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={ScrollText} title={t.audit.emptyTitle} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">{t.audit.when}</TableHead>
                    <TableHead>{t.audit.who}</TableHead>
                    <TableHead>{t.audit.what}</TableHead>
                    <TableHead>{t.audit.target}</TableHead>
                    <TableHead className="pr-4">{t.audit.details}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((e) => {
                    const href = targetHref(e)
                    return (
                      <TableRow key={e.id} className="align-top">
                        <TableCell className="pl-4 whitespace-nowrap text-muted-foreground">{formatDate(e.createdAt, locale, true)}</TableCell>
                        <TableCell>
                          <span className="block">{e.admin?.name ?? t.audit.system}</span>
                          {e.ipAddress && <span className="block font-mono text-xs text-muted-foreground">{e.ipAddress}</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{e.action}</TableCell>
                        <TableCell className="text-xs">
                          <span className="block">{e.entityType}</span>
                          {href ? (
                            <Link to={href} className="font-mono text-primary hover:underline">
                              {e.entityId.slice(0, 8)}
                            </Link>
                          ) : (
                            <span className="font-mono text-muted-foreground">{e.entityId.slice(0, 8)}</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-md pr-4">
                          {e.changes && <code className="line-clamp-3 text-xs break-all whitespace-pre-wrap text-muted-foreground">{JSON.stringify(e.changes)}</code>}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </PageBody>
    </>
  )
}
