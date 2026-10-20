"use client";

import { LAO_BANKS, type BankCode } from "@talad/shared";
import { Camera, Check, Copy, Download, LoaderCircle, QrCode } from "lucide-react";
import { useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { ShopTransferInfo } from "@/lib/cart";
import { groupDigits } from "@/lib/profile";

export interface SlipState {
  preview: string | null;
  uploading: boolean;
  attached: boolean;
  error: string | null;
}

export const emptySlip: SlipState = { preview: null, uploading: false, attached: false, error: null };

/**
 * Manual payment for one shop: its QR + account to transfer to, the exact amount,
 * and the slip upload (required before the order can be confirmed).
 */
export function PaymentPanel({
  title,
  qrSrc,
  amount,
  transfer,
  slip,
  onPickSlip,
  dict,
  bare = false,
}: {
  title: string;
  /** Image URL of the shop's QR (null when the shop only has account details). */
  qrSrc: string | null;
  amount: string;
  transfer: ShopTransferInfo;
  slip: SlipState;
  onPickSlip: (file: File) => void;
  dict: Dictionary["checkout"];
  /** No card frame of its own, for use inside another card (the chat order card). */
  bare?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const bank = transfer.bankCode && transfer.bankCode in LAO_BANKS ? LAO_BANKS[transfer.bankCode as BankCode] : transfer.bankCode;

  async function copyAccount() {
    if (!transfer.accountNumber) return;
    await navigator.clipboard.writeText(transfer.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className={bare ? "flex flex-col gap-4" : "flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-5"}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <h3 className="mt-0.5 flex items-center gap-2 font-semibold text-primary">
          <QrCode className="size-5" />
          {dict.scanTitle}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{dict.scanBody}</p>
      </div>

      <div className={`flex flex-col items-center gap-3 rounded-2xl bg-muted/50 text-center ${bare ? "px-2 py-3" : "p-4"}`}>
        {qrSrc && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- private image streamed per session */}
            <img src={qrSrc} alt={dict.scanTitle} className="aspect-square w-full max-w-56 rounded-xl bg-white p-2 ring-1 ring-border sm:max-w-64" />
          </>
        )}
        <div>
          <p className="text-xs text-muted-foreground">{dict.amountToPay}</p>
          <p className="text-3xl font-bold text-primary">{amount}</p>
        </div>
        {qrSrc && (
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-xs text-muted-foreground">{dict.saveQrHint}</p>
            <a
              href={`${qrSrc}${qrSrc.includes("?") ? "&" : "?"}download=1`}
              className="flex items-center gap-1.5 rounded-full border border-primary px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
            >
              <Download className="size-4" />
              {dict.downloadQr}
            </a>
          </div>
        )}
        {transfer.accountNumber && (
          <div className={`mt-1 w-full rounded-xl bg-card py-2.5 text-left text-sm ring-1 ring-border ${bare ? "px-3" : "px-4"}`}>
            {bank && <p className="text-xs text-muted-foreground">{bank}</p>}
            <p className="break-words font-medium">{transfer.accountName}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 break-all font-mono tracking-wide">{groupDigits(transfer.accountNumber)}</span>
              <button
                type="button"
                onClick={copyAccount}
                className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? dict.copied : dict.copy}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="flex items-center gap-1.5 font-semibold">
          <Camera className="size-4 text-primary" />
          {dict.slipTitle} <span className="text-sale">*</span>
        </h4>
        <p className="text-sm text-muted-foreground">{dict.slipBody}</p>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPickSlip(file);
            e.target.value = "";
          }}
        />
        {slip.preview ? (
          <div className="flex items-center gap-4 rounded-xl border border-border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img src={slip.preview} alt="" className="h-24 w-20 rounded-lg object-cover ring-1 ring-border" />
            <div className="flex flex-col items-start gap-1.5">
              {slip.uploading ? (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  {dict.uploading}
                </span>
              ) : (
                slip.attached && (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-primary">
                    <Check className="size-4" />
                    {dict.slipAttached}
                  </span>
                )
              )}
              <button
                type="button"
                disabled={slip.uploading}
                onClick={() => fileInput.current?.click()}
                className="rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {dict.changeSlip}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-xl border-2 border-dashed border-primary/40 bg-primary-soft/60 px-4 py-6 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
          >
            + {dict.chooseSlip}
          </button>
        )}
        {slip.error && <p role="alert" className="text-sm text-sale">{slip.error}</p>}
      </div>
    </section>
  );
}
