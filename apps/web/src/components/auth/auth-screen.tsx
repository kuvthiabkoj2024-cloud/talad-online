import type { Locale } from "@talad/shared";
import { redirect } from "next/navigation";
import { BadgeCheck, CreditCard, ShoppingBag, Store, Truck } from "lucide-react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { safeNext } from "@/lib/customer";
import { getCurrentCustomer } from "@/lib/session";
import type { AuthMode } from "./auth-form";
import { AuthPageForm } from "./auth-page-form";

const POINT_ICONS = [BadgeCheck, CreditCard, Truck];

/** Full-page sign in / sign up: brand panel (desktop) + form card. */
export async function AuthScreen({
  mode,
  locale,
  dict,
  next,
}: {
  mode: AuthMode;
  locale: Locale;
  dict: Dictionary["auth"];
  next: string | string[] | undefined;
}) {
  const target = safeNext(typeof next === "string" ? next : null, `/${locale}`);
  if (await getCurrentCustomer()) redirect(target);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:py-12 lg:grid-cols-[1fr_minmax(0,28rem)] lg:gap-10">
      <aside className="relative hidden overflow-hidden rounded-3xl bg-gradient-to-br from-[#43a047] via-primary to-[#1b5e20] p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 text-2xl font-bold">
          <Store className="size-8" strokeWidth={2.25} />
          Taladonline
        </div>
        <div className="relative z-10">
          <h1 className="text-4xl font-extrabold leading-tight">{dict.brandTitle}</h1>
          <ul className="mt-8 space-y-4">
            {dict.brandPoints.map((point, i) => {
              const Icon = POINT_ICONS[i % POINT_ICONS.length];
              return (
                <li key={point} className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-primary-foreground/90">{point}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <ShoppingBag aria-hidden strokeWidth={1} className="absolute -bottom-10 -right-10 size-72 text-white/10" />
      </aside>

      <section className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border sm:p-8">
        <AuthPageForm locale={locale} dict={dict} mode={mode} next={target} />
      </section>
    </div>
  );
}
