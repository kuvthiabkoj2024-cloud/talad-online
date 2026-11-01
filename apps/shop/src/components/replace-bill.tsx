import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Label } from '@talad/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talad/ui/components/select'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { BillPhotoField } from '@/components/bill-photo-field'
import { queryKeys, useDeliveryProviders } from '@/hooks/queries'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, send, upload } from '@/lib/api'
import type { ShopOrderDetail, ShopOrderSummary } from '@/lib/types'

/** Uploads a new courier's bill for a parcel on its way, replacing the wrong one. */
export function ReplaceBill({ order }: { order: Pick<ShopOrderSummary, 'number' | 'deliveryProvider'> }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const providers = useDeliveryProviders()
  const [open, setOpen] = useState(false)
  const [bill, setBill] = useState<File | null>(null)
  const [providerId, setProviderId] = useState(order.deliveryProvider?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const path = `/me/shop/orders/${encodeURIComponent(order.number)}/bill`

  const run = useMutation({
    mutationFn: async (file: File) => {
      const { billKey } = await upload<{ billKey: string }>(path, file)
      return send<ShopOrderDetail>('PUT', path, { billKey, ...(providerId && { deliveryProviderId: providerId }) })
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.order(order.number), saved)
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders })
      toast.success(t.orders.replaceBill.done)
      close()
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : undefined
      setError(code && code in t.orders.errors ? t.orders.errors[code as keyof Dict['orders']['errors']] : t.common.saveError)
    },
  })

  function close() {
    setOpen(false)
    setBill(null)
    setError(null)
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <ReceiptText />
        {t.orders.replaceBill.action}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !next && close()}>
        <DialogContent className="sm:max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!bill) return setError(t.orders.billRequired)
              run.mutate(bill)
            }}
          >
            <DialogHeader>
              <DialogTitle>{t.orders.replaceBill.action}</DialogTitle>
              <DialogDescription>{t.orders.replaceBill.body}</DialogDescription>
            </DialogHeader>
            <BillPhotoField file={bill} onChange={(file) => (setBill(file), setError(null))} />
            <div className="flex flex-col gap-1.5">
              <Label>{t.orders.courier}</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.orders.chooseCourier} />
                </SelectTrigger>
                <SelectContent>
                  {providers.data?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={run.isPending}>
                {run.isPending && <LoaderCircle className="animate-spin" />}
                {t.orders.replaceBill.send}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
