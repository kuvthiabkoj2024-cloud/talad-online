"use client";

import { formatPhone, type Locale } from "@talad/shared";
import {
  ChevronDown,
  CircleUser,
  ExternalLink,
  LogOut,
  Store,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { avatarSrc, initials, SELLER_CENTER_URL, type CustomerProfile } from "@/lib/customer";
import { accountLinks } from "../account/account-links";
import { LogoutDialog } from "../account/logout-dialog";
import { AuthForm } from "./auth-form";
import { Modal } from "./modal";
import { useSession } from "./session-provider";

type Dicts = Pick<Dictionary, "auth" | "account">;

/** Header account area: "Sign in" (opens the auth modal) or the customer dropdown. */
export function AccountMenu({ locale, dict }: { locale: Locale; dict: Dicts }) {
  const { customer, status, setCustomer } = useSession();
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);

  if (status === "loading") {
    // A real link: still usable if the page's scripts haven't run yet.
    return (
      <Link
        href={`/${locale}/account/profile`}
        aria-label={dict.account.myAccount}
        className="flex size-9 items-center justify-center rounded-full bg-white/20"
      >
        <CircleUser className="size-6 opacity-70" />
      </Link>
    );
  }

  if (!customer) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="flex items-center gap-2 rounded-full p-2 text-sm font-medium transition-colors hover:bg-white/15 lg:border lg:border-white/60 lg:px-4 lg:py-1.5"
        >
          <CircleUser className="size-6 lg:size-5" />
          <span className="hidden lg:inline">{dict.auth.signIn}</span>
        </button>
        <Modal open={authOpen} onClose={() => setAuthOpen(false)} closeLabel={dict.auth.close}>
          <AuthForm
            locale={locale}
            dict={dict.auth}
            onSuccess={(c) => {
              setCustomer(c);
              setAuthOpen(false);
              router.refresh();
            }}
          />
        </Modal>
      </>
    );
  }

  return <CustomerDropdown locale={locale} dict={dict} customer={customer} />;
}

function CustomerDropdown({
  locale,
  dict,
  customer,
}: {
  locale: Locale;
  dict: Dicts;
  customer: CustomerProfile;
}) {
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const firstName = customer.name.split(/\s+/)[0];
  const items = accountLinks(locale, dict.account);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-1 pr-2 text-sm font-medium transition-colors hover:bg-white/15"
      >
        <Avatar customer={customer} className="size-8 bg-white text-primary" />
        <span className="hidden max-w-28 truncate lg:inline">{firstName}</span>
        <ChevronDown className={`hidden size-4 transition-transform lg:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-72 origin-top-right animate-[modal-in_150ms_ease-out] overflow-hidden rounded-2xl bg-card text-foreground shadow-2xl ring-1 ring-border"
        >
          <div className="flex items-center gap-3 bg-primary-soft px-4 py-4">
            <Avatar customer={customer} className="size-12 bg-primary text-primary-foreground text-base" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{customer.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {customer.phone ? formatPhone(customer.phone) : customer.email}
              </p>
            </div>
          </div>
          <div className="p-2">
            {items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-muted"
              >
                <Icon className="size-5 text-muted-foreground" />
                {label}
              </Link>
            ))}
            {customer.shop && (
              <a
                href={SELLER_CENTER_URL}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-muted"
              >
                <Store className="size-5 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block">{dict.account.myShop}</span>
                  <span className="block truncate text-xs text-muted-foreground">{customer.shop.name}</span>
                </span>
                <ExternalLink className="size-4 text-muted-foreground" />
              </a>
            )}
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setConfirmLogout(true);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sale transition-colors hover:bg-sale/10"
            >
              <LogOut className="size-5" />
              {dict.account.logout}
            </button>
          </div>
        </div>
      )}

      <LogoutDialog open={confirmLogout} onClose={() => setConfirmLogout(false)} locale={locale} dict={dict} />
    </div>
  );
}

export function Avatar({ customer, className = "" }: { customer: CustomerProfile; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold ${className}`}>
      {avatarSrc(customer) ? (
        // eslint-disable-next-line @next/next/no-img-element -- provider avatar host varies
        <img src={avatarSrc(customer)!} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
      ) : (
        initials(customer.name)
      )}
    </span>
  );
}
