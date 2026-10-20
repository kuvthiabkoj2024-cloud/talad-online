import { BottomNav } from "@/components/bottom-nav";
import { SiteFooter } from "@/components/site-footer";
import { HideFooterOnRoutes, HideHeaderOnPhones } from "@/components/focus-routes";
import { InstallBanner } from "@/components/pwa/install-banner";
import { StaleClientReload } from "@/components/stale-client-reload";
import { SiteHeader } from "@/components/site-header";
import { getDictionary, getLocale } from "../dictionaries";

/**
 * Storefront chrome: full header (search, cart, account), footer and the phone tab bar;
 * focus pages drop the search and footer.
 */
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dict = await getDictionary();
  return (
    <>
      <HideHeaderOnPhones>
        <SiteHeader locale={locale} dict={dict.header} accountDict={{ auth: dict.auth, account: dict.account }} />
      </HideHeaderOnPhones>
      <main className="flex-1">{children}</main>
      <HideFooterOnRoutes>
        <SiteFooter locale={locale} dict={dict.footer} />
      </HideFooterOnRoutes>
      <BottomNav locale={locale} dict={dict.nav} />
      <InstallBanner dict={dict.pwa} />
      <StaleClientReload />
    </>
  );
}
