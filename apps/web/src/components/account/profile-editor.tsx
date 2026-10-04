"use client";

import { CUSTOMER_LIMITS, formatPhone } from "@talad/shared";
import { CalendarDays, Camera, LoaderCircle, Lock, Mail, Pencil, Phone, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { removeAvatar, updateProfile, uploadAvatar } from "@/lib/account-actions";
import type { CustomerProfile } from "@/lib/customer";
import { interpolate } from "@/lib/format";
import type { ProfileErrorCode } from "@/lib/profile";
import { Avatar } from "../auth/account-menu";
import { Modal } from "../auth/modal";
import { useSession } from "../auth/session-provider";
import { Field, FormError, inputClass, PrimaryButton } from "./form-controls";

type Dict = Dictionary["account"];

/** Profile card (photo, name) and editable personal info. */
export function ProfileEditor({
  customer: initial,
  dict,
  labels,
  memberSince,
}: {
  customer: CustomerProfile;
  dict: Dict;
  labels: { fullName: string; phone: string; close: string };
  memberSince: string;
}) {
  const router = useRouter();
  const { setCustomer } = useSession();
  const [customer, setLocal] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoPending, startPhoto] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const errorText = (code: ProfileErrorCode) => dict.profileErrors[code] ?? dict.profileErrors.generic;

  /** Keep this page, the header and server components in sync after a change. */
  function applied(next: CustomerProfile) {
    setLocal(next);
    setCustomer(next);
    router.refresh();
  }

  function pickPhoto(file: File | undefined) {
    if (!file) return;
    if (!(CUSTOMER_LIMITS.qrMimeTypes as readonly string[]).includes(file.type)) return setPhotoError(errorText("INVALID_QR"));
    if (file.size > CUSTOMER_LIMITS.qrMaxBytes) return setPhotoError(errorText("FILE_TOO_LARGE"));
    setPhotoError(null);
    const form = new FormData();
    form.set("photo", file);
    startPhoto(async () => {
      const res = await uploadAvatar(form);
      if (res.ok) applied(res.customer);
      else setPhotoError(errorText(res.error));
    });
  }

  function deletePhoto() {
    setPhotoError(null);
    startPhoto(async () => {
      const res = await removeAvatar();
      if (res.ok) applied(res.customer);
      else setPhotoError(errorText(res.error));
    });
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        <div className="h-16 bg-gradient-to-r from-[#43a047] via-primary to-[#1b5e20] sm:h-20" />
        <div className="flex flex-col items-center gap-3 px-5 pb-5 text-center sm:flex-row sm:items-end sm:text-left">
          <div className="relative -mt-10 shrink-0">
            <Avatar customer={customer} className="size-20 border-4 border-card bg-primary-soft text-xl text-primary shadow-md" />
            {photoPending && (
              <span className="absolute inset-1 flex items-center justify-center rounded-full bg-black/40 text-white">
                <LoaderCircle className="size-6 animate-spin" />
              </span>
            )}
            <button
              type="button"
              aria-label={customer.avatarVersion ? dict.changePhoto : dict.uploadPhoto}
              disabled={photoPending}
              onClick={() => fileInput.current?.click()}
              className="absolute -bottom-0.5 -right-0.5 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-card transition hover:brightness-110 disabled:opacity-60"
            >
              <Camera className="size-4" />
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={CUSTOMER_LIMITS.qrMimeTypes.join(",")}
              className="sr-only"
              onChange={(e) => {
                pickPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          <div className="min-w-0 flex-1 sm:pb-1">
            <h2 className="truncate text-lg font-bold">{customer.name}</h2>
            <p className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground sm:justify-start">
              <CalendarDays className="size-4" />
              {interpolate(dict.memberSince, { date: memberSince })}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 sm:items-end sm:pb-1">
            <div className="flex gap-1">
              <button
                type="button"
                disabled={photoPending}
                onClick={() => fileInput.current?.click()}
                className="rounded-full px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft disabled:opacity-50"
              >
                {customer.avatarVersion ? dict.changePhoto : dict.uploadPhoto}
              </button>
              {customer.avatarVersion && (
                <button
                  type="button"
                  disabled={photoPending}
                  onClick={deletePhoto}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-sale transition-colors hover:bg-sale/10 disabled:opacity-50"
                >
                  {dict.removePhoto}
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">{dict.photoHint}</p>
          </div>
        </div>
        {photoError && <p role="alert" className="mx-5 mb-4 rounded-xl bg-sale/10 px-4 py-2 text-sm text-sale">{photoError}</p>}
      </section>

      <section className="rounded-2xl bg-card p-2 shadow-sm ring-1 ring-border">
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-2">
          <h2 className="font-semibold">{dict.personalInfo}</h2>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft"
          >
            <Pencil className="size-3.5" />
            {dict.editProfile}
          </button>
        </div>
        <dl className="divide-y divide-border">
          <InfoRow icon={UserRound} label={labels.fullName} value={customer.name} />
          <InfoRow
            icon={Phone}
            label={labels.phone}
            value={customer.phone ? formatPhone(customer.phone) : dict.notSet}
            muted={!customer.phone}
          />
          <InfoRow icon={Mail} label={dict.email} value={customer.email ?? dict.notSet} muted={!customer.email} />
        </dl>
      </section>

      <Modal open={editing} onClose={() => setEditing(false)} closeLabel={labels.close} size="lg">
        {editing && (
          <EditProfileForm
            customer={customer}
            dict={dict}
            labels={labels}
            errorText={errorText}
            onSaved={(next) => {
              applied(next);
              setEditing(false);
            }}
          />
        )}
      </Modal>
    </>
  );
}

function EditProfileForm({
  customer,
  dict,
  labels,
  errorText,
  onSaved,
}: {
  customer: CustomerProfile;
  dict: Dict;
  labels: { fullName: string; phone: string };
  errorText: (code: ProfileErrorCode) => string;
  onSaved: (customer: CustomerProfile) => void;
}) {
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateProfile({ name, email });
      if (res.ok) onSaved(res.customer);
      else setError(errorText(res.error));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <h2 className="pr-8 text-xl font-bold">{dict.editProfile}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={labels.fullName}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            className={inputClass}
          />
        </Field>
        <Field label={dict.email}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder={dict.emailPlaceholder}
            maxLength={254}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label={labels.phone} hint={dict.phoneLocked}>
        <span className="flex h-11 items-center justify-between rounded-xl border border-border bg-muted/60 px-3.5 text-sm text-muted-foreground">
          {customer.phone ? formatPhone(customer.phone) : dict.notSet}
          <Lock className="size-4" />
        </span>
      </Field>
      <FormError message={error} />
      <PrimaryButton type="submit" pending={pending}>
        {dict.save}
      </PrimaryButton>
    </form>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={`truncate font-medium ${muted ? "text-muted-foreground" : ""}`}>{value}</dd>
      </div>
    </div>
  );
}
