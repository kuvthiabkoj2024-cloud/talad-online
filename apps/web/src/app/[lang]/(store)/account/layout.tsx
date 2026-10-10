import { BackToAccount } from "@/components/account/back-to-account";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

/**
 * Account pages are reached from the header dropdown or the /account hub (phones), so
 * no side navigation here; pages listed on the hub get a link back to it.
 */
export default async function AccountLayout({ children }: LayoutProps<"/[lang]/account">) {
  const locale = await getLocale();
  const { account } = await getDictionary();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:py-8">
      <BackToAccount href={`/${locale}/account`} label={account.backToAccount} />
      {children}
    </div>
  );
}
