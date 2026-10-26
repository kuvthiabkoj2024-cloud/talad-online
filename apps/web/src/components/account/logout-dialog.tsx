"use client";

import type { Locale } from "@talad/shared";
import { LoaderCircle, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { logout } from "@/lib/auth-actions";
import { removePushSubscription } from "@/lib/push-actions";
import { disablePush } from "@/lib/web-push";
import { Modal } from "../auth/modal";
import { useSession } from "../auth/session-provider";

type Dicts = Pick<Dictionary, "auth" | "account">;

/** "Log out?" confirmation; leaves account pages for home once signed out. */
export function LogoutDialog({
  open,
  onClose,
  locale,
  dict,
}: {
  open: boolean;
  onClose: () => void;
  locale: Locale;
  dict: Dicts;
}) {
  const { setCustomer } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function doLogout() {
    startTransition(async () => {
      // This browser stops getting the account's notifications (while the session still works).
      await disablePush(removePushSubscription);
      await logout();
      setCustomer(null);
      onClose();
      if (pathname.startsWith(`/${locale}/account`)) router.push(`/${locale}`);
      router.refresh();
    });
  }

  return (
    <Modal open={open} onClose={onClose} closeLabel={dict.auth.close} size="sm">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-sale/10 text-sale">
          <LogOut className="size-7" />
        </span>
        <div>
          <h2 className="text-xl font-bold">{dict.account.logoutTitle}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">{dict.account.logoutBody}</p>
        </div>
        <div className="mt-2 grid w-full grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-full border border-border font-semibold transition-colors hover:bg-muted"
          >
            {dict.account.cancel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={doLogout}
            className="flex h-11 items-center justify-center gap-2 rounded-full bg-sale font-semibold text-white transition hover:brightness-110 disabled:opacity-70"
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {dict.account.logout}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Account hub's log out row, with its confirmation. */
export function LogoutButton({ locale, dict }: { locale: Locale; dict: Dicts }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3.5 text-sm font-medium text-sale shadow-sm ring-1 ring-border transition-colors hover:bg-sale/5"
      >
        <LogOut className="size-5" />
        {dict.account.logout}
      </button>
      <LogoutDialog open={open} onClose={() => setOpen(false)} locale={locale} dict={dict} />
    </>
  );
}
