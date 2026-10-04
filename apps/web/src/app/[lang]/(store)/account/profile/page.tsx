import { formatPhone } from "@talad/shared";
import { CheckCircle2, ExternalLink, Store } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { PageHeading } from "@/components/account/page-heading";
import { ProfileEditor } from "@/components/account/profile-editor";
import { SELLER_CENTER_URL } from "@/lib/customer";
import { requireCustomer } from "@/lib/require-customer";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { account } = await getDictionary();
  return { title: account.profileTitle, robots: { index: false } };
}

const DATE_LOCALES = { lo: "lo-LA", en: "en-GB" } as const;

export default async function ProfilePage() {
  const locale = await getLocale();
  const { account: dict, auth } = await getDictionary();
  const customer = await requireCustomer(locale, `/${locale}/account/profile`);

  const memberSince = new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    year: "numeric",
    month: "long",
  }).format(new Date(customer.createdAt));

  const methods = [
    { label: dict.phoneMethod, connected: customer.phone !== null, detail: customer.phone && formatPhone(customer.phone) },
    { label: "Google", connected: customer.linked.google, detail: null },
    { label: "Apple", connected: customer.linked.apple, detail: null },
  ];

  return (
    <>
      <PageHeading title={dict.profileTitle} description={dict.profileDescription} />

      <ProfileEditor
        customer={customer}
        dict={dict}
        labels={{ fullName: auth.fullName, phone: auth.phone, close: auth.close }}
        memberSince={memberSince}
      />

      {customer.shop && (
        <section className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:flex-row sm:items-center">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Store className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{dict.myShop}</p>
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              <span className="truncate">{customer.shop.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  customer.shop.status === "APPROVED" ? "bg-primary-soft text-primary" : "bg-amber-50 text-amber-700"
                }`}
              >
                {dict.shopStatus[customer.shop.status]}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{dict.myShopDescription}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {customer.shop.status === "APPROVED" && (
              <Link
                href={`/${locale}/s/${customer.shop.slug}`}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
              >
                {dict.viewStorefront}
              </Link>
            )}
            <a
              href={SELLER_CENTER_URL}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
            >
              {dict.manageShop}
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-card p-2 shadow-sm ring-1 ring-border">
        <h2 className="px-4 pb-1 pt-3 font-semibold">{dict.signInMethods}</h2>
        <ul className="divide-y divide-border">
          {methods.map((m) => (
            <li key={m.label} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0">
                <p className="font-medium">{m.label}</p>
                {m.detail && <p className="truncate text-sm text-muted-foreground">{m.detail}</p>}
              </div>
              {m.connected ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
                  <CheckCircle2 className="size-3.5" />
                  {dict.connected}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {dict.notConnected}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
