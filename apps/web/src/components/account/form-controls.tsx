"use client";

import { ChevronDown, LoaderCircle, type LucideIcon } from "lucide-react";
import { Modal } from "../auth/modal";

export const inputClass =
  "h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-primary/15";

export function Field({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/** Native <select> styled like the inputs (keeps mobile pickers and a11y for free). */
export function Select({
  value,
  onChange,
  placeholder,
  options,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <span className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className={`${inputClass} appearance-none pr-10 ${value ? "" : "text-muted-foreground/70"}`}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-foreground">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}

export function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-semibold">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-4" />
      </span>
      {children}
    </h3>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "bg-primary" : "bg-border"
      }`}
    >
      <span
        className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function PrimaryButton({
  pending,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean }) {
  return (
    <button
      {...props}
      disabled={pending || props.disabled}
      className="flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 disabled:opacity-60"
    >
      {pending && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-sale/10 px-4 py-2.5 text-sm text-sale">
      {message}
    </p>
  );
}

/** "Delete X?" confirmation. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} closeLabel={cancelLabel} size="sm">
      <div className="flex flex-col gap-4 text-center">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-full border border-border font-semibold transition-colors hover:bg-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="flex h-11 items-center justify-center gap-2 rounded-full bg-sale font-semibold text-white transition hover:brightness-110 disabled:opacity-70"
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Small text-style action used on list cards (Edit, Delete, Make default). */
export function CardAction({
  tone = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "default" | "primary" | "danger" }) {
  const color =
    tone === "danger"
      ? "text-sale hover:bg-sale/10"
      : tone === "primary"
        ? "text-primary hover:bg-primary-soft"
        : "text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <button
      type="button"
      {...props}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${color}`}
    />
  );
}
