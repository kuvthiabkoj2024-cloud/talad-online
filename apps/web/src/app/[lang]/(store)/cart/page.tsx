import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { OrderCard } from "@/components/account/order-card";
import { CartView } from "@/components/cart/cart-view";
import type { CartView as CartData } from "@/lib/cart";
import type { OrderList } from "@/lib/orders";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { cart } = await getDictionary();
  return { title: cart.title, robots: { index: false } };
}

/**
 * Cart (§4.4). Guests must sign in to buy, so the cart lives on the account. An empty cart
 * shows the customer's latest orders underneath.
 */
export default async function CartPage() {
  const locale = await getLocale();
  const { cart: dict, account, checkout } = await getDictionary();
  await requireCustomer(locale, `/${locale}/cart`);
  const cart = await apiGetAsCustomer<CartData>("/me/cart");
  const shops = cart?.shops ?? [];
  const recent = shops.length === 0 ? ((await apiGetAsCustomer<OrderList>("/me/orders?pageSize=5"))?.orders ?? []) : [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:py-8">
      <CartView
        locale={locale}
        dict={dict}
        shops={shops}
        recentOrders={
          recent.length > 0 && (
            <section aria-labelledby="recent-orders" className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 id="recent-orders" className="text-lg font-bold">
                  {dict.recentOrders}
                </h2>
                <Link href={`/${locale}/account/orders`} className="flex items-center gap-0.5 text-sm font-semibold text-primary hover:underline">
                  {dict.allOrders}
                  <ChevronRight className="size-4" />
                </Link>
              </div>
              <ul className="grid gap-3 md:grid-cols-2">
                {recent.map((order) => (
                  <OrderCard key={order.number} order={order} locale={locale} dict={account} checkoutDict={checkout} />
                ))}
              </ul>
              <Link
                href={`/${locale}/account/orders`}
                className="flex h-11 items-center justify-center gap-1 rounded-full border border-primary/40 bg-card text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
              >
                {dict.allOrders}
                <ChevronRight className="size-4" />
              </Link>
            </section>
          )
        }
      />
    </div>
  );
}
