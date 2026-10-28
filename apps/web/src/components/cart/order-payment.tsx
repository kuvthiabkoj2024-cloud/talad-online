"use client";

import { MAX_PAYMENT_SLIPS, type Locale } from "@talad/shared";
import { CircleAlert, CircleCheck, LoaderCircle, SendHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { attachOrderSlips } from "@/lib/cart-actions";
import type { TransferAccount } from "@/lib/cart";
import { compressImage } from "@/lib/compress-image";
import { interpolate } from "@/lib/format";
import { formatDate, type PaymentCheck, type PaymentSlip } from "@/lib/orders";
import { Modal } from "../auth/modal";
import { emptySlip, PaymentPanel } from "./payment-panel";

type Picked = { file: File; preview: string };

/**
 * Paying an existing order by transfer to Taladonline: while slips are being checked it shows
 * them; with none yet, or after a rejection (with the reason), the customer sends up to
 * MAX_PAYMENT_SLIPS new ones.
 */
export function OrderPayment({
  locale,
  orderNumber,
  amount,
  transfer,
  check,
  slips,
  dict,
  cartErrors,
  closeLabel,
}: {
  locale: Locale;
  orderNumber: string;
  amount: string;
  transfer: TransferAccount;
  check: PaymentCheck;
  slips: PaymentSlip[];
  dict: Dictionary["checkout"];
  cartErrors: Dictionary["cartErrors"];
  closeLabel: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const rejected = check === "rejected" ? slips.find((s) => s.status === "REJECTED") : undefined;

  async function pick(original: File) {
    if (picked.length >= MAX_PAYMENT_SLIPS) return;
    const file = await compressImage(original);
    setError(null);
    setPicked((list) => [...list, { file, preview: URL.createObjectURL(file) }]);
  }

  function remove(index: number) {
    URL.revokeObjectURL(picked[index].preview);
    setPicked((list) => list.filter((_, i) => i !== index));
  }

  function send() {
    const form = new FormData();
    for (const p of picked) form.append("slips", p.file);
    startSending(async () => {
      const res = await attachOrderSlips(orderNumber, form);
      if (!res.ok) return setError(cartErrors[res.error as keyof typeof cartErrors] ?? cartErrors.generic);
      for (const p of picked) URL.revokeObjectURL(p.preview);
      setPicked([]);
      router.refresh();
    });
  }

  const slipModal = (
    <Modal open={viewing !== null} onClose={() => setViewing(null)} closeLabel={closeLabel} size="sm">
      {viewing && (
        // eslint-disable-next-line @next/next/no-img-element -- private image streamed per session
        <img src={`/api/orders/${encodeURIComponent(orderNumber)}/slips/${viewing}`} alt={dict.viewSlip} className="mx-auto max-h-[70vh] rounded-xl ring-1 ring-border" />
      )}
    </Modal>
  );

  if (check === "reviewing") {
    const waiting = slips.filter((s) => s.status === "PENDING");
    return (
      <>
        <div className="flex flex-col gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800 ring-1 ring-inset ring-sky-200">
          <div className="flex items-start gap-3">
            <CircleCheck className="mt-0.5 size-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{dict.verifying}</p>
              <p className="opacity-90">{dict.slipReceived}</p>
              <p className="text-xs opacity-75">{interpolate(dict.slipsSent, { date: formatDate(waiting[0].createdAt, locale, true) })}</p>
            </div>
          </div>
          <SlipThumbs orderNumber={orderNumber} slips={waiting} onOpen={setViewing} label={dict.viewSlip} />
        </div>
        {slipModal}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rejected && (
        <div className="flex items-start gap-3 rounded-2xl bg-sale/10 px-4 py-3 text-sm text-sale ring-1 ring-inset ring-sale/25">
          <CircleAlert className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{dict.slipRejectedTitle}</p>
            <p>{interpolate(dict.slipRejectedBody, { reason: rejected.rejectReason ?? "—", n: MAX_PAYMENT_SLIPS })}</p>
          </div>
        </div>
      )}
      <PaymentPanel
        title={dict.payTaladonline}
        qrSrc={transfer.hasQr ? "/api/payment-qr" : null}
        amount={amount}
        transfer={transfer}
        slips={picked.map((p) => ({ ...emptySlip, preview: p.preview }))}
        max={MAX_PAYMENT_SLIPS}
        onPickSlip={(file) => void pick(file)}
        onRemoveSlip={remove}
        dict={dict}
      />
      {error && <p role="alert" className="text-sm text-sale">{error}</p>}
      <button
        type="button"
        disabled={!picked.length || sending}
        onClick={send}
        className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
      >
        {sending ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
        {sending ? dict.sendingSlips : dict.sendSlips}
      </button>
      {slips.length > 0 && (
        <SlipThumbs orderNumber={orderNumber} slips={slips} onOpen={setViewing} label={dict.viewSlip} statusLabels={dict.slipStatus} />
      )}
      {slipModal}
    </div>
  );
}

/** Small previews of sent slips (tap to see one large), with their check result. */
function SlipThumbs({
  orderNumber,
  slips,
  onOpen,
  label,
  statusLabels,
}: {
  orderNumber: string;
  slips: PaymentSlip[];
  onOpen: (id: string) => void;
  label: string;
  statusLabels?: Record<PaymentSlip["status"], string>;
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {slips.map((s) => (
        <li key={s.id} className="flex flex-col items-center gap-1">
          <button type="button" onClick={() => onOpen(s.id)} aria-label={label} className="overflow-hidden rounded-lg ring-1 ring-border transition hover:ring-primary">
            {/* eslint-disable-next-line @next/next/no-img-element -- private image streamed per session */}
            <img src={`/api/orders/${encodeURIComponent(orderNumber)}/slips/${s.id}`} alt="" className="h-20 w-16 bg-white object-cover" />
          </button>
          {statusLabels && (
            <span className={`text-[11px] font-semibold ${s.status === "REJECTED" ? "text-sale" : s.status === "APPROVED" ? "text-primary" : "text-muted-foreground"}`}>
              {statusLabels[s.status]}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
