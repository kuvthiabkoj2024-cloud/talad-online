"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { PaymentPanel, emptySlip, type SlipState } from "@/components/cart/payment-panel";
import { resendDepositSlip } from "@/lib/cart-actions";
import type { TransferAccount } from "@/lib/cart";
import { compressImage } from "@/lib/compress-image";
import { interpolate } from "@/lib/format";

/** The shop rejected the deposit slip: pay again if needed and send a new one. */
export function DepositResend({
  orderNumber,
  shopId,
  shopName,
  amount,
  account,
  dict,
  cartErrors,
}: {
  orderNumber: string;
  shopId: string;
  shopName: string;
  amount: string;
  account: TransferAccount;
  dict: Dictionary["checkout"];
  cartErrors: Dictionary["cartErrors"];
}) {
  const router = useRouter();
  const [slip, setSlip] = useState<SlipState | null>(null);

  async function pick(original: File) {
    const file = await compressImage(original);
    setSlip({ ...emptySlip, preview: URL.createObjectURL(file), uploading: true });
    const form = new FormData();
    form.set("slip", file);
    const res = await resendDepositSlip(orderNumber, form);
    if (res.ok) return router.refresh();
    setSlip((s) => s && { ...s, uploading: false, error: cartErrors[res.error as keyof typeof cartErrors] ?? cartErrors.generic });
  }

  return (
    <PaymentPanel
      title={interpolate(dict.depositFor, { shop: shopName })}
      scanTitle={interpolate(dict.depositScanTitle, { shop: shopName })}
      scanBody={dict.depositScanBody}
      qrSrc={account.hasQr ? `/api/shops/${shopId}/deposit-qr` : null}
      amount={amount}
      transfer={account}
      slips={slip ? [slip] : []}
      onPickSlip={(file) => void pick(file)}
      dict={dict}
    />
  );
}
