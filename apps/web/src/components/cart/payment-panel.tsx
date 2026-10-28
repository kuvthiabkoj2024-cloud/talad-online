"use client";

import { LAO_BANKS, type BankCode } from "@talad/shared";
import { Camera, Check, Copy, Download, LoaderCircle, Plus, QrCode, X } from "lucide-react";
import { useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { TransferAccount } from "@/lib/cart";
import { interpolate } from "@/lib/format";
import { groupDigits } from "@/lib/profile";

export interface SlipState {
  preview: string | null;
  uploading: boolean;
  attached: boolean;
  error: string | null;
}

export const emptySlip: SlipState = { preview: null, uploading: false, attached: false, error: null };

/**
 * Manual payment: Taladonline's QR + account to transfer to, the exact amount, and the slips
 * (required; up to `max`, for a payment split over several transfers). An admin checks them.
 */
export function PaymentPanel({
  title,
  qrSrc,
  amount,
  transfer,
  slips,
  max = 1,
  onPickSlip,
  onRemoveSlip,
  dict,
  bare = false,
}: {
  title: string;
  /** Image URL of the receiving QR (null when there are only account details). */
  qrSrc: string | null;
  amount: string;
  transfer: TransferAccount;
  slips: SlipState[];
  /** How many slips can be attached (1 = picking again replaces the slip). */
  max?: number;
  onPickSlip: (file: File) => void;
  onRemoveSlip?: (index: number) => void;
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
        <p className="text-sm text-muted-foreground">{max > 1 ? interpolate(dict.slipsBody, { n: max }) : dict.slipBody}</p>
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
        {slips.some((x) => x.preview || x.attached) ? (
          <ul className="flex flex-wrap gap-3">
            {slips.map((x, i) => (
              <li key={i} className="relative flex w-24 flex-col items-center gap-1">
                {x.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview
                  <img src={x.preview} alt="" className="h-28 w-24 rounded-lg object-cover ring-1 ring-border" />
                ) : (
                  <span className="flex h-28 w-24 items-center justify-center rounded-lg bg-primary-soft text-primary ring-1 ring-border">
                    <Check className="size-6" />
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs">
                  {x.uploading ? (
                    <>
                      <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
                      <span className="text-muted-foreground">{dict.uploading}</span>
                    </>
                  ) : x.error ? (
                    <span className="text-sale">{dict.slipFailed}</span>
                  ) : (
                    x.attached && (
                      <span className="flex items-center gap-1 font-semibold text-primary">
                        <Check className="size-3.5" />
                        {dict.slipAttached}
                      </span>
                    )
                  )}
                </span>
                {onRemoveSlip && !x.uploading && (
                  <button
                    type="button"
                    onClick={() => onRemoveSlip(i)}
                    aria-label={dict.removeSlip}
                    title={dict.removeSlip}
                    className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-card text-muted-foreground shadow ring-1 ring-border hover:text-sale"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
            {slips.length < max ? (
              <li>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex h-28 w-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-primary/40 bg-primary-soft/60 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft"
                >
                  <Plus className="size-5" />
                  {dict.addSlip}
                </button>
              </li>
            ) : (
              max === 1 && (
                <li className="self-center">
                  <button
                    type="button"
                    disabled={slips[0]?.uploading}
                    onClick={() => fileInput.current?.click()}
                    className="rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {dict.changeSlip}
                  </button>
                </li>
              )
            )}
          </ul>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-xl border-2 border-dashed border-primary/40 bg-primary-soft/60 px-4 py-6 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
          >
            + {dict.chooseSlip}
          </button>
        )}
        {slips.map((x, i) => x.error && <p key={i} role="alert" className="text-sm text-sale">{x.error}</p>)}
      </div>
    </section>
  );
}
