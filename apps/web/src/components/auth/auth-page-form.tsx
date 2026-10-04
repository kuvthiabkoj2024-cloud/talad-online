"use client";

import type { Locale } from "@talad/shared";
import { useRouter } from "next/navigation";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { AuthForm, type AuthMode } from "./auth-form";
import { useSession } from "./session-provider";

/** AuthForm for the /login and /register pages: switches route on mode change, redirects on success. */
export function AuthPageForm({
  locale,
  dict,
  mode,
  next,
}: {
  locale: Locale;
  dict: Dictionary["auth"];
  mode: AuthMode;
  next: string;
}) {
  const router = useRouter();
  const { setCustomer } = useSession();
  const query = `?next=${encodeURIComponent(next)}`;

  return (
    <AuthForm
      key={mode}
      locale={locale}
      dict={dict}
      initialMode={mode}
      onModeChange={(m) => router.replace(`/${locale}/${m}${query}`)}
      onSuccess={(customer) => {
        setCustomer(customer);
        router.replace(next);
        router.refresh();
      }}
    />
  );
}
