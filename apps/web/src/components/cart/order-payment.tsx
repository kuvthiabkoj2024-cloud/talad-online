"use client";

import { type Locale } from "@talad/shared";
import { CircleCheck, Eye, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { attachOrderSlip } from "@/lib/cart-actions";
import type { ShopTransferInfo } from "@/lib/cart";
import { compressImage } from "@/lib/compress-image";
import { interpolate } from "@/lib/format";
import { formatDate } from "@/lib/orders";
import { Modal } from "../auth/modal";
import { emptySlip, PaymentPanel, type SlipState } from "./payment-panel";

/**
 * Manual payment on an existing order: pay later (QR + slip upload) or, once a slip
 * was sent, show it with the option to replace it while the shop hasn't confirmed.
 */
export function OrderPayment({
  locale,
  orderNumber,
  amount,
  transfer,
  slipUploadedAt,
  dict,
  cartErrors,
  closeLabel,
}: {
  locale: Locale;
  orderNumber: string;
  amount: string;
  transfer: ShopTransferInfo;
  slipUploadedAt: string | null;
  dict: Dictionary["checkout"];
  cartErrors: Dictionary["cartErrors"];
  closeLabel: string;
}) {
  const router = useRouter();
  const [slip, setSlip] = useState<SlipState>(emptySlip);
  const [replacing, setReplacing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const slipUrl = `/api/orders/${encodeURIComponent(orderNumber)}/slip?v=${slipUploadedAt ?? ""}`;

  async function pick(original: File) {
    if (slip.preview) URL.revokeObjectURL(slip.preview);
    const file = await compressImage(original);
    setSlip({ ...emptySlip, preview: URL.createObjectURL(file), uploading: true });
    const form = new FormData();
    form.set("slip", file);
    const res = await attachOrderSlip(orderNumber, form);
    setSlip((s) => ({
      ...s,
      uploading: false,
      attached: res.ok,
      error: res.ok ? null : (cartErrors[res.error as keyof typeof cartErrors] ?? cartErrors.generic),
    }));
    if (res.ok) {
      setReplacing(false);
      router.refresh();
    }
  }

  if (slipUploadedAt && !replacing) {
    return (
      <>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800 ring-1 ring-inset ring-sky-200">
          <CircleCheck className="size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{dict.verifying}</p>
            <p className="opacity-90">{dict.slipReceived}</p>
            <p className="text-xs opacity-75">{interpolate(dict.slipSentOn, { date: formatDate(slipUploadedAt, locale, true) })}</p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setViewing(true)}
              className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-sky-200 transition-colors hover:bg-sky-100"
            >
              <Eye className="size-3.5" />
              {dict.viewSlip}
            </button>
            <button
              type="button"
              onClick={() => setReplacing(true)}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-sky-100"
            >
              <RefreshCw className="size-3.5" />
              {dict.changeSlip}
            </button>
          </div>
        </div>
        <Modal open={viewing} onClose={() => setViewing(false)} closeLabel={closeLabel} size="sm">
          {viewing && (
            // eslint-disable-next-line @next/next/no-img-element -- private image streamed per session
            <img src={slipUrl} alt={dict.viewSlip} className="mx-auto max-h-[70vh] rounded-xl ring-1 ring-border" />
          )}
        </Modal>
      </>
    );
  }

  return (
    <PaymentPanel
      title={dict.payNowTitle}
      qrSrc={transfer.hasQr ? `/api/orders/${encodeURIComponent(orderNumber)}/qr` : null}
      amount={amount}
      transfer={transfer}
      slip={slip}
      onPickSlip={(file) => void pick(file)}
      dict={dict}
    />
  );
}
