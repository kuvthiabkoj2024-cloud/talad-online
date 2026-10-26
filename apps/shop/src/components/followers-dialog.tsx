import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Heart, LoaderCircle, Users } from 'lucide-react'
import { useState } from 'react'
import { useMyShop } from '@/hooks/queries'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import { fill, formatDate, formatNumber } from '@/lib/format'
import type { FollowerPage } from '@/lib/types'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

/** "N followers" button that opens the list of customers following the shop, newest first. */
export function FollowersButton() {
  const { t, locale } = useI18n()
  const shop = useMyShop()
  const [open, setOpen] = useState(false)
  const list = useInfiniteQuery({
    queryKey: ['shop', 'followers'],
    queryFn: ({ pageParam }) => api<FollowerPage>(`/me/shop/followers?limit=20${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: open,
  })
  const count = shop.data?.followerCount ?? 0
  const items = list.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Heart className="text-primary" />
        {fill(t.followers.count, { n: formatNumber(count, locale) })}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.followers.title}</DialogTitle>
            <DialogDescription>{t.followers.description}</DialogDescription>
          </DialogHeader>
          {list.isPending ? (
            <div className="flex justify-center py-8">
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-primary">
                <Users className="size-6" />
              </span>
              <p className="font-medium">{t.followers.empty}</p>
              <p className="max-w-xs text-sm text-muted-foreground">{t.followers.emptyBody}</p>
            </div>
          ) : (
            <ul className="-mx-1 flex max-h-[55dvh] flex-col overflow-y-auto">
              {items.map(({ customer, followedAt }) => (
                <li key={customer.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
                  <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft text-xs font-semibold text-primary">
                    {customer.avatarUrl ? <img src={customer.avatarUrl} alt="" className="size-full object-cover" /> : initials(customer.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{customer.name}</span>
                    <span className="block text-xs text-muted-foreground">{fill(t.followers.since, { date: formatDate(followedAt, locale) })}</span>
                  </span>
                </li>
              ))}
              {list.hasNextPage && (
                <li className="pt-2">
                  <Button type="button" variant="ghost" className="w-full" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
                    {list.isFetchingNextPage && <LoaderCircle className="animate-spin" />}
                    {t.followers.more}
                  </Button>
                </li>
              )}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
