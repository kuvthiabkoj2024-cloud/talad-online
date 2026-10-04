"use client";

import {
  CUSTOMER_LIMITS,
  formatPhone,
  normalizePhone,
  PROVINCE_CODES,
  provinceName,
  type Locale,
} from "@talad/shared";
import { ContactRound, MapPin, MapPinPlus, Plus, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { deleteAddress, saveAddress, setDefaultAddress } from "@/lib/account-actions";
import type { AddressItem, ProfileErrorCode } from "@/lib/profile";
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

export function AddressBook({
  locale,
  dict,
  closeLabel,
  addresses,
}: {
  locale: Locale;
  dict: Dict;
  closeLabel: string;
  addresses: AddressItem[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AddressItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<AddressItem | null>(null);
  const [pending, startTransition] = useTransition();
  const atLimit = addresses.length >= CUSTOMER_LIMITS.maxAddresses;

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
      {dict.addAddress}
    </button>
  );

  return (
    <>
      <PageHeading title={dict.addresses} description={dict.addressesDescription} action={addresses.length > 0 && addButton} />

      {addresses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-10 text-center shadow-sm ring-1 ring-border">
          <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
            <MapPinPlus className="size-7" strokeWidth={1.75} />
          </span>
          <h2 className="font-semibold">{dict.noAddresses}</h2>
          <p className="max-w-xs text-sm text-muted-foreground">{dict.noAddressesBody}</p>
          <div className="mt-3">{addButton}</div>
        </div>
      ) : (
        <ul className="grid gap-3">
          {addresses.map((a) => {
            return (
              <li
                key={a.id}
                className={`rounded-2xl bg-card p-4 shadow-sm ring-1 transition-shadow hover:shadow-md ${
                  a.isDefault ? "ring-primary/40" : "ring-border"
                }`}
              >
                <div className="flex gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <MapPin className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{a.recipientName}</span>
                      {a.isDefault && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                          {dict.defaultBadge}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{formatPhone(a.phone)}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                      {[a.line, a.village, a.district, provinceName(a.province, locale)].filter(Boolean).join(", ")}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-1 border-t border-border pt-2">
                  {!a.isDefault && (
                    <CardAction tone="primary" disabled={pending} onClick={() => run(() => setDefaultAddress(a.id))}>
                      {dict.makeDefault}
                    </CardAction>
                  )}
                  <CardAction onClick={() => setEditing(a)}>{dict.edit}</CardAction>
                  <CardAction tone="danger" onClick={() => setDeleting(a)}>
                    {dict.delete}
                  </CardAction>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} closeLabel={closeLabel} size="lg">
        {editing && (
          <AddressForm
            locale={locale}
            dict={dict}
            initial={editing === "new" ? null : editing}
            isFirst={addresses.length === 0}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={dict.deleteAddressTitle}
        body={dict.deleteBody}
        confirmLabel={dict.delete}
        cancelLabel={dict.cancel}
        pending={pending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && run(() => deleteAddress(deleting.id), () => setDeleting(null))}
      />
    </>
  );
}

export function AddressForm({
  locale,
  dict,
  initial,
  isFirst,
  onSaved,
}: {
  locale: Locale;
  dict: Dict;
  initial: AddressItem | null;
  isFirst: boolean;
  onSaved: (id?: string) => void;
}) {
  const [recipientName, setRecipientName] = useState(initial?.recipientName ?? "");
  const [phone, setPhone] = useState(initial ? initial.phone.replace(/^\+856/, "") : "");
  const [line, setLine] = useState(initial?.line ?? "");
  const [province, setProvince] = useState<string>(
    initial && (PROVINCE_CODES as string[]).includes(initial.province) ? initial.province : "",
  );
  const [district, setDistrict] = useState(initial?.district ?? "");
  const [village, setVillage] = useState(initial?.village ?? "");
  // The first address is always the default; the current default can't be switched off here.
  const lockedDefault = isFirst || initial?.isDefault === true;
  const [isDefault, setIsDefault] = useState(lockedDefault);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fail = (code: ProfileErrorCode) => setError(dict.profileErrors[code] ?? dict.profileErrors.generic);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!normalizePhone(phone)) return fail("INVALID_PHONE");
    setError(null);
    startTransition(async () => {
      const res = await saveAddress(
        { recipientName, phone, line, province, district, village, isDefault },
        initial?.id,
      );
      if (res.ok) onSaved(res.id);
      else fail(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <h2 className="pr-8 text-xl font-bold">{initial ? dict.editAddress : dict.addAddress}</h2>

      <div className="flex flex-col gap-3">
        <SectionTitle icon={ContactRound}>{dict.contactSection}</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
        <Field label={dict.recipientName}>
          <input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder={dict.recipientNamePlaceholder}
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            className={inputClass}
          />
        </Field>
        <Field label={dict.phoneMethod}>
          <span className="flex h-11 items-center rounded-xl border border-border bg-card px-3.5 transition-colors focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
            <span className="mr-2.5 border-r border-border pr-2.5 text-sm font-semibold text-muted-foreground">+856</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="20 5555 1234"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              required
              className="h-full w-full bg-transparent text-sm tabular-nums outline-none placeholder:text-muted-foreground/60"
            />
          </span>
        </Field>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle icon={MapPin}>{dict.addressSection}</SectionTitle>
        <Field label={dict.addressLine}>
          <input
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder={dict.addressLinePlaceholder}
            autoComplete="street-address"
            required
            minLength={3}
            maxLength={255}
            className={inputClass}
          />
        </Field>
        <Field label={dict.province}>
          <Select
            value={province}
            onChange={setProvince}
            placeholder={dict.selectProvince}
            required
            options={PROVINCE_CODES.map((code) => ({ value: code, label: provinceName(code, locale) }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={dict.district}>
            <input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder={dict.districtPlaceholder}
              required
              maxLength={100}
              className={inputClass}
            />
          </Field>
          <Field label={dict.village}>
            <input
              value={village}
              onChange={(e) => setVillage(e.target.value)}
              placeholder={dict.villagePlaceholder}
              maxLength={100}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <SectionTitle icon={Settings}>{dict.settingsSection}</SectionTitle>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 px-4 py-3">
          <span className="text-sm">{dict.setAsDefault}</span>
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
