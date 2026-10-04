import { redirect } from "next/navigation";
import { getLocale } from "@/app/[lang]/dictionaries";

export default async function AccountIndex() {
  redirect(`/${await getLocale()}/account/profile`);
}
