"use client";

import {
  BANK_CODES,
  CUSTOMER_LIMITS,
  LAO_BANKS,
  normalizeAccountNumber,
  type BankCode,
} from "@talad/shared";
import { ImageUp, Info, Landmark, Plus, QrCode, Settings, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { deleteBankAccount, saveBankAccount, setDefaultBankAccount } from "@/lib/account-actions";
import { groupDigits, type BankAccountItem, type ProfileErrorCode } from "@/lib/profile";
import { Modal } from "../auth/modal";
import {
  CardAction,
  ConfirmDialog,
  Field,
  FormError,
  inputClass,
  PrimaryButton,
  SectionTitle,
  Select,
  Switch,
} from "./form-controls";
import { PageHeading } from "./page-heading";

type Dict = Dictionary["account"];

const qrUrl = (id: string) => `/api/bank-qr/${id}`;

export function BankAccounts({
  dict,
  closeLabel,
  accounts,
}: {
  dict: Dict;
  closeLabel: string;
  accounts: BankAccountItem[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<BankAccountItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<BankAccountItem | null>(null);
  const [viewingQr, setViewingQr] = useState<BankAccountItem | null>(null);
  const [pending, startTransition] = useTransition();
  const atLimit = accounts.length >= CUSTOMER_LIMITS.maxBankAccounts;

  function run(action: () => Promise<{ ok: boolean }>, after?: () => void) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        after?.();
        router.refresh();
      }
    });
  }

  const addButton = (
    <button
      type="button"
      disabled={atLimit}
      onClick={() => setEditing("new")}
      className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
    >
      <Plus className="size-4" />
      {dict.addBank}
    </button>
  );

  return (
    <>
      <PageHeading title={dict.bankAccounts} description={dict.bankAccountsDescription} action={accounts.length > 0 && addButton} />

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-10 text-center shadow-sm ring-1 ring-border">
          <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
            <WalletCards className="size-7" strokeWidth={1.75} />
          </span>
          <h2 className="font-semibold">{dict.noBanks}</h2>
          <p className="max-w-xs text-sm text-muted-foreground">{dict.noBanksBody}</p>
          <div className="mt-3">{addButton}</div>
        </div>
      ) : (
        <>
          <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5" />
            {dict.defaultRefundHint}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {accounts.map((a) => (
              <li
                key={a.id}
                className={`flex flex-col rounded-2xl bg-card p-4 shadow-sm ring-1 transition-shadow hover:shadow-md ${
                  a.isDefault ? "ring-primary/40" : "ring-border"
                }`}
              >
                <div className="flex items-start gap-3">
                  <BankBadge code={a.bankCode} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{bankName(a.bankCode)}</p>
                      {a.isDefault && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                          {dict.defaultBadge}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm">{a.accountName}</p>
                    <p className="font-mono text-sm tracking-wide text-muted-foreground">{groupDigits(a.accountNumber)}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-1 border-t border-border pt-2">
                  {a.hasQr ? (
                    <CardAction onClick={() => setViewingQr(a)}>
                      <QrCode className="size-3.5" />
                      {dict.viewQr}
                    </CardAction>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-1">
                    {!a.isDefault && (
                      <CardAction tone="primary" disabled={pending} onClick={() => run(() => setDefaultBankAccount(a.id))}>
                        {dict.makeDefault}
                      </CardAction>
                    )}
                    <CardAction onClick={() => setEditing(a)}>{dict.edit}</CardAction>
                    <CardAction tone="danger" onClick={() => setDeleting(a)}>
                      {dict.delete}
                    </CardAction>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} closeLabel={closeLabel} size="lg">
        {editing && (
          <BankForm
            dict={dict}
            initial={editing === "new" ? null : editing}
            isFirst={accounts.length === 0}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </Modal>

      <Modal open={viewingQr !== null} onClose={() => setViewingQr(null)} closeLabel={closeLabel} size="sm">
        {viewingQr && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="pr-8 font-semibold">{bankName(viewingQr.bankCode)}</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- private image streamed per session */}
            <img src={qrUrl(viewingQr.id)} alt={dict.viewQr} className="w-full max-w-64 rounded-xl ring-1 ring-border" />
            <p className="text-sm">{viewingQr.accountName}</p>
            <p className="font-mono text-sm text-muted-foreground">{groupDigits(viewingQr.accountNumber)}</p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={dict.deleteBankTitle}
        body={dict.deleteBody}
        confirmLabel={dict.delete}
        cancelLabel={dict.cancel}
        pending={pending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && run(() => deleteBankAccount(deleting.id), () => setDeleting(null))}
      />
    </>
  );
}

function bankName(code: string): string {
  return code in LAO_BANKS ? LAO_BANKS[code as BankCode] : code;
}

function BankBadge({ code }: { code: string }) {
  return (
    <span className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#43a047] to-[#1b5e20] px-2 text-[11px] font-bold tracking-wide text-white">
      {code === "OTHER" ? <Landmark className="size-5" /> : code}
    </span>
  );
}

type QrState = { kind: "keep" } | { kind: "remove" } | { kind: "new"; file: File; preview: string };

function BankForm({
  dict,
  initial,
  isFirst,
  onSaved,
}: {
  dict: Dict;
  initial: BankAccountItem | null;
  isFirst: boolean;
  onSaved: () => void;
}) {
  const [bankCode, setBankCode] = useState<string>(initial?.bankCode ?? "");
  const [accountName, setAccountName] = useState(initial?.accountName ?? "");
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber ?? "");
  const lockedDefault = isFirst || initial?.isDefault === true;
  const [isDefault, setIsDefault] = useState(lockedDefault);
  const [qr, setQr] = useState<QrState>({ kind: "keep" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // Free the object URL of a replaced/abandoned preview.
  useEffect(() => {
    return () => {
      if (qr.kind === "new") URL.revokeObjectURL(qr.preview);
    };
  }, [qr]);

  const fail = (code: ProfileErrorCode) => setError(dict.profileErrors[code] ?? dict.profileErrors.generic);
  const previewSrc =
    qr.kind === "new" ? qr.preview : qr.kind === "keep" && initial?.hasQr ? qrUrl(initial.id) : null;

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!(CUSTOMER_LIMITS.qrMimeTypes as readonly string[]).includes(file.type)) return fail("INVALID_QR");
    if (file.size > CUSTOMER_LIMITS.qrMaxBytes) return fail("FILE_TOO_LARGE");
    setError(null);
    setQr({ kind: "new", file, preview: URL.createObjectURL(file) });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!normalizeAccountNumber(accountNumber)) return fail("INVALID_ACCOUNT_NUMBER");
    setError(null);
    const form = new FormData();
    form.set("bankCode", bankCode);
    form.set("accountName", accountName);
    form.set("accountNumber", accountNumber);
    form.set("isDefault", String(isDefault));
    if (qr.kind === "new") form.set("qr", qr.file);
    if (qr.kind === "remove") form.set("qr", "remove");
    startTransition(async () => {
      const res = await saveBankAccount(form, initial?.id);
      if (res.ok) onSaved();
      else fail(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <h2 className="pr-8 text-xl font-bold">{initial ? dict.editBank : dict.addBank}</h2>

      <div className="flex flex-col gap-3">
        <SectionTitle icon={Landmark}>{dict.bankSection}</SectionTitle>
        <Field label={dict.accountName}>
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder={dict.accountNamePlaceholder}
            required
            minLength={2}
            maxLength={100}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
        <Field label={dict.bank}>
          <Select
            value={bankCode}
            onChange={setBankCode}
            placeholder={dict.selectBank}
            required
            options={BANK_CODES.map((code) => ({ value: code, label: LAO_BANKS[code] }))}
          />
        </Field>
        <Field label={dict.accountNumber}>
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder={dict.accountNumberPlaceholder}
            inputMode="numeric"
            autoComplete="off"
            required
            className={`${inputClass} font-mono tracking-wide`}
          />
        </Field>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle icon={QrCode}>{dict.qrSection}</SectionTitle>
        <p className="-mt-1 text-xs text-muted-foreground">{dict.qrHelp}</p>
        <input
          ref={fileInput}
          type="file"
          accept={CUSTOMER_LIMITS.qrMimeTypes.join(",")}
          className="sr-only"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {previewSrc ? (
          <div className="flex items-center gap-4 rounded-xl border border-border p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview / private image */}
            <img src={previewSrc} alt="" className="size-20 rounded-lg object-contain ring-1 ring-border" />
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-primary">{dict.qrAttached}</p>
              <div className="flex gap-1">
                <CardAction onClick={() => fileInput.current?.click()}>{dict.changeQr}</CardAction>
                <CardAction tone="danger" onClick={() => setQr({ kind: "remove" })}>
                  {dict.removeQr}
                </CardAction>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFile(e.dataTransfer.files[0]);
            }}
            className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
          >
            <ImageUp className="size-7 text-primary" />
            <span className="text-sm font-semibold">{dict.uploadQr}</span>
            <span className="text-xs text-muted-foreground">{dict.qrFormats}</span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle icon={Settings}>{dict.settingsSection}</SectionTitle>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm">
            {dict.setAsDefault}
            <span title={dict.defaultRefundHint}>
              <Info className="size-4 text-muted-foreground" aria-label={dict.defaultRefundHint} />
            </span>
          </span>
          <Switch checked={isDefault} onChange={setIsDefault} disabled={lockedDefault} label={dict.setAsDefault} />
        </div>
      </div>

      <FormError message={error} />
      <PrimaryButton type="submit" pending={pending}>
        {dict.save}
      </PrimaryButton>
    </form>
  );
}
