import type { Locale } from "@talad/shared";
import { Coins, Landmark, MapPin, MessagesSquare, Package, Store, UserRound } from "lucide-react";
import type { Dictionary } from "@/app/[lang]/dictionaries";

/** Account pages, as listed in the header dropdown and the phone account hub. */
export function accountLinks(locale: Locale, dict: Dictionary["account"]) {
  return [
    { href: `/${locale}/account/profile`, label: dict.profile, icon: UserRound },
    { href: `/${locale}/account/orders`, label: dict.orders, icon: Package },
    { href: `/${locale}/account/points`, label: dict.myPoints, icon: Coins },
    { href: `/${locale}/messages`, label: dict.messages, icon: MessagesSquare },
    { href: `/${locale}/account/following`, label: dict.followedShops, icon: Store },
    { href: `/${locale}/account/addresses`, label: dict.addresses, icon: MapPin },
    { href: `/${locale}/account/bank-accounts`, label: dict.bankAccounts, icon: Landmark },
  ];
}
