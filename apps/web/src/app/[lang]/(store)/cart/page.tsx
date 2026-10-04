import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";
import type { CartView as CartData } from "@/lib/cart";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { cart } = await getDictionary();
  return { title: cart.title, robots: { index: false } };
}

/** Cart (§4.4). Guests must sign in to buy, so the cart lives on the account. */
export default async function CartPage() {
  const locale = await getLocale();
  const { cart: dict } = await getDictionary();
  await requireCustomer(locale, `/${locale}/cart`);
  const cart = await apiGetAsCustomer<CartData>("/me/cart");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:py-8">
      <CartView locale={locale} dict={dict} shops={cart?.shops ?? []} />
    </div>
  );
}
