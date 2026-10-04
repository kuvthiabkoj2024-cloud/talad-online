import type { Metadata } from "next";
import { BankAccounts } from "@/components/account/bank-accounts";
import type { BankAccountItem } from "@/lib/profile";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { account } = await getDictionary();
  return { title: account.bankAccounts, robots: { index: false } };
}

export default async function BankAccountsPage() {
  const locale = await getLocale();
  const { account, auth } = await getDictionary();
  await requireCustomer(locale, `/${locale}/account/bank-accounts`);
  const accounts = (await apiGetAsCustomer<BankAccountItem[]>("/me/bank-accounts")) ?? [];

  return <BankAccounts dict={account} closeLabel={auth.close} accounts={accounts} />;
}
