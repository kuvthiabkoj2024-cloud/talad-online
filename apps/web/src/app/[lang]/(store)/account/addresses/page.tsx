import type { Metadata } from "next";
import { AddressBook } from "@/components/account/address-book";
import type { AddressItem } from "@/lib/profile";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { account } = await getDictionary();
  return { title: account.addresses, robots: { index: false } };
}

export default async function AddressesPage() {
  const locale = await getLocale();
  const { account, auth } = await getDictionary();
  await requireCustomer(locale, `/${locale}/account/addresses`);
  const addresses = (await apiGetAsCustomer<AddressItem[]>("/me/addresses")) ?? [];

  return <AddressBook locale={locale} dict={account} closeLabel={auth.close} addresses={addresses} />;
}
