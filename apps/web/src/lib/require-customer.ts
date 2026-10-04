import "server-only";

import { redirect } from "next/navigation";
import type { CustomerProfile } from "./customer";
import { getCurrentCustomer } from "./session";

/** For signed-in-only pages: the customer, or a redirect to sign in and back. */
export async function requireCustomer(locale: string, returnTo: string): Promise<CustomerProfile> {
  const customer = await getCurrentCustomer();
  if (!customer) redirect(`/${locale}/login?next=${encodeURIComponent(returnTo)}`);
  return customer;
}
