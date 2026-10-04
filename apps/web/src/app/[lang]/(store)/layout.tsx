import { SiteFooter } from "@/components/site-footer";
import { HideOnFocusRoutes } from "@/components/focus-routes";
import { SiteHeader } from "@/components/site-header";
import { getDictionary, getLocale } from "../dictionaries";

/** Storefront chrome: full header (search, cart, account) and footer; focus pages drop the search and footer. */
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dict = await getDictionary();
  return (
    <>
      <SiteHeader locale={locale} dict={dict.header} accountDict={{ auth: dict.auth, account: dict.account }} />
      <main className="flex-1">{children}</main>
      <HideOnFocusRoutes>
        <SiteFooter locale={locale} dict={dict.footer} />
      </HideOnFocusRoutes>
    </>
  );
}
