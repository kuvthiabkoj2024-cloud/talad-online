import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutForm } from "@/components/cart/checkout-form";
import type { CheckoutQuote } from "@/lib/cart";
import type { AddressItem } from "@/lib/profile";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer, apiPostAsCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { checkout } = await getDictionary();
  return { title: checkout.title, robots: { index: false } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * Checkout for the cart lines in `?items=id,id` (§4.4). The form keeps the courier,
 * coupon and address in the URL too, so a server re-render keeps those choices.
 */
export default async function CheckoutPage({ searchParams }: PageProps<"/[lang]/checkout">) {
  const locale = await getLocale();
  const { checkout, cart, account, cartErrors, auth } = await getDictionary();
  const { items, courier, coupon, address, points } = await searchParams;
  const itemIds = [...new Set(param(items).split(",").filter((id) => UUID.test(id)))];
  const self = `/${locale}/checkout?items=${itemIds.join(",")}`;
  await requireCustomer(locale, self);

  const [quote, addresses] = await Promise.all([
    itemIds.length
      ? apiPostAsCustomer<CheckoutQuote>("/me/checkout/quote", {
          itemIds,
          ...(UUID.test(param(courier)) && { deliveryProviderId: param(courier) }),
          ...(param(coupon) && { couponCode: param(coupon).slice(0, 40) }),
          ...(UUID.test(param(address)) && { addressId: param(address) }),
          ...(param(points) === "1" && { usePoints: true }),
        })
      : null,
    apiGetAsCustomer<AddressItem[]>("/me/addresses"),
  ]);
  // Nothing (valid) selected — e.g. items already ordered in another tab.
  if (!quote) redirect(`/${locale}/cart`);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:py-8">
      <CheckoutForm
        locale={locale}
        dict={checkout}
        accountDict={account}
        cartErrors={cartErrors}
        closeLabel={auth.close}
        stepperLabels={{ decrease: cart.decrease, increase: cart.increase }}
        quote={quote}
        addresses={addresses ?? []}
        initialAddressId={UUID.test(param(address)) ? param(address) : null}
        itemIds={itemIds}
      />
    </div>
  );
}
