import { CheckoutFooter, CheckoutHeader } from "@/components/cart/checkout-chrome";
import { getDictionary, getLocale } from "../dictionaries";

/**
 * Distraction-free checkout: no search, menus or full footer, so the customer
 * finishes paying. Logo, language and the form's "Back to cart" stay as exits.
 */
export default async function CheckoutLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const { checkout, header, footer } = await getDictionary();
  return (
    <>
      <CheckoutHeader locale={locale} secureLabel={checkout.secure} languageLabel={header.language} />
      <main className="flex-1">{children}</main>
      <CheckoutFooter locale={locale} dict={footer} />
    </>
  );
}
