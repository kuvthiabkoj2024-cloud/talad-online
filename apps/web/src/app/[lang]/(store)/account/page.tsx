import { formatPhone } from "@talad/shared";
import { ChevronRight, CircleCheckBig, ExternalLink, Package, Store, Truck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { accountLinks } from "@/components/account/account-links";
import { LogoutButton } from "@/components/account/logout-dialog";
import { Avatar } from "@/components/auth/account-menu";
import { OPEN_SHOP_URL, SELLER_CENTER_URL } from "@/lib/customer";
import { requireCustomer } from "@/lib/require-customer";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { account } = await getDictionary();
  return { title: account.myAccount, robots: { index: false } };
}

const row =
  "flex items-center gap-3 px-4 py-3.5 text-sm transition-colors hover:bg-muted";

/**
 * Account hub, opened from the phone tab bar's Profile tab: everything the header's
 * account dropdown offers on larger screens.
 */
export default async function AccountHub() {
  const locale = await getLocale();
  const { account: dict, auth } = await getDictionary();
  const customer = await requireCustomer(locale, `/${locale}/account`);
  const orders = `/${locale}/account/orders`;

  const shortcuts = [
    { status: "to-pay", label: dict.toPay, icon: Wallet },
    { status: "to-ship", label: dict.toShip, icon: Package },
    { status: "to-receive", label: dict.toReceive, icon: Truck },
    { status: "completed", label: dict.completed, icon: CircleCheckBig },
  ];

  return (
    <>
      <h1 className="sr-only">{dict.myAccount}</h1>

      <Link
        href={`/${locale}/account/profile`}
        className="flex items-center gap-4 rounded-2xl bg-primary px-4 py-5 text-primary-foreground shadow-sm"
      >
        <Avatar customer={customer} className="size-14 bg-white text-base text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold">{customer.name}</span>
          <span className="block truncate text-sm opacity-85">
            {customer.phone ? formatPhone(customer.phone) : customer.email}
          </span>
        </span>
        <ChevronRight className="size-5 opacity-85" />
      </Link>

      <section className="rounded-2xl bg-card shadow-sm ring-1 ring-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{dict.orders}</h2>
          <Link href={orders} className="flex items-center text-sm text-muted-foreground hover:text-foreground">
            {dict.viewAllOrders}
            <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-4 py-2">
          {shortcuts.map(({ status, label, icon: Icon }) => (
            <Link
              key={status}
              href={`${orders}?status=${status}`}
              className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-center text-xs transition-colors hover:bg-muted"
            >
              <Icon className="size-6 text-primary" />
              {label}
            </Link>
          ))}
        </div>
      </section>

      <nav className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {accountLinks(locale, dict).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={row}>
            <Icon className="size-5 text-muted-foreground" />
            <span className="flex-1">{label}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
        {customer.shop ? (
          <a href={SELLER_CENTER_URL} className={row}>
            <Store className="size-5 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block">{dict.myShop}</span>
              <span className="block truncate text-xs text-muted-foreground">{customer.shop.name}</span>
            </span>
            <ExternalLink className="size-4 text-muted-foreground" />
          </a>
        ) : (
          <a href={OPEN_SHOP_URL} className={row}>
            <Store className="size-5 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block">{dict.openShop}</span>
              <span className="block truncate text-xs text-muted-foreground">{dict.openShopDescription}</span>
            </span>
            <ExternalLink className="size-4 text-muted-foreground" />
          </a>
        )}
      </nav>

      <LogoutButton locale={locale} dict={{ auth, account: dict }} />
    </>
  );
}
