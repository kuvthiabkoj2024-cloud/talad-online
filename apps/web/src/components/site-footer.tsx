import type { Locale } from "@talad/shared";
import { Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { OPEN_SHOP_URL } from "@/lib/customer";

/** Taladonline's own contact and social accounts. */
const CONTACT = {
  phone: "+8562077802519",
  phoneLabel: "020 7780 2519",
  whatsapp: "https://wa.me/8562077802519",
  facebook: "https://www.facebook.com/share/1VLjVhxkG2/",
  tiktok: "https://www.tiktok.com/@talad.online",
};

const BANKS = [
  { src: "/images/footer/bcel-one.webp", name: "BCEL One" },
  { src: "/images/footer/ldb.webp", name: "LDB" },
  { src: "/images/footer/jdb.webp", name: "JDB" },
  { src: "/images/footer/apb.webp", name: "APB" },
];
const WALLETS = [
  { src: "/images/footer/m-money.webp", name: "M-Money" },
  { src: "/images/footer/u-money.webp", name: "U-Money" },
];
const COURIERS = [
  { src: "/images/footer/anousith.webp", name: "Anousith Express" },
  { src: "/images/footer/mixay.webp", name: "Mixay Express" },
  { src: "/images/footer/hal.webp", name: "HAL Express" },
];

/* Brand marks (Simple Icons), drawn in their own colours. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

/** A payment logo on a white rounded tile (like the reference footer). */
function LogoTile({ src, name }: { src: string; name: string }) {
  return (
    <li title={name} className="flex size-12 items-center justify-center rounded-lg bg-white p-1.5 shadow-sm">
      <Image src={src} alt={name} width={40} height={40} className="h-full w-auto object-contain" />
    </li>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-base font-bold text-white">{children}</h2>;
}

export function SiteFooter({ locale, dict }: { locale: Locale; dict: Dictionary["footer"] }) {
  const pages = [
    ["about", dict.about],
    ["terms", dict.terms],
    ["privacy", dict.privacy],
    ["faq", dict.faq],
  ] as const;
  const social = [
    { href: CONTACT.whatsapp, label: "WhatsApp", icon: WhatsAppIcon, color: "text-[#25D366]" },
    { href: CONTACT.facebook, label: "Facebook", icon: FacebookIcon, color: "text-[#1877F2]" },
    { href: CONTACT.tiktok, label: "TikTok", icon: TikTokIcon, color: "text-black" },
  ];

  return (
    <footer className="mt-16 bg-primary text-sm text-primary-foreground">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 lg:grid-cols-[1.1fr_1fr_1.5fr_0.9fr_1fr]">
        {/* Help (full width on phones; "about" and "follow" share a row) */}
        <section className="col-span-2 lg:col-span-1">
          <Heading>{dict.help}</Heading>
          <a
            href={CONTACT.whatsapp}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full bg-white px-5 py-3 text-base font-bold text-primary shadow-md transition hover:bg-white/90"
          >
            <WhatsAppIcon className="size-6 text-[#25D366]" />
            {dict.contactUs}
          </a>
          <a href={`tel:${CONTACT.phone}`} className="mt-5 flex w-fit items-center gap-3 font-semibold hover:underline">
            <span className="flex size-8 items-center justify-center rounded-lg bg-white text-primary">
              <Phone className="size-4" />
            </span>
            {CONTACT.phoneLabel}
          </a>
        </section>

        {/* About */}
        <section>
          <Heading>{dict.aboutTaladonline}</Heading>
          <ul className="space-y-3 text-white/85">
            {pages.map(([slug, label]) => (
              <li key={slug}>
                <Link href={`/${locale}/pages/${slug}`} className="hover:text-white hover:underline">
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <a href={OPEN_SHOP_URL} className="font-semibold text-white underline-offset-2 hover:underline">
                {dict.sell}
              </a>
            </li>
          </ul>
        </section>

        {/* Payment methods (phones: after "about" + "follow", which share a row) */}
        <section className="order-4 col-span-2 lg:order-none lg:col-span-1">
          <Heading>{dict.payments}</Heading>
          <p className="mb-2 text-white/75">{dict.banks}</p>
          <ul className="flex flex-wrap gap-2">
            {BANKS.map((b) => (
              <LogoTile key={b.name} {...b} />
            ))}
          </ul>
          <p className="mt-4 mb-2 text-white/75">{dict.wallets}</p>
          <ul className="flex flex-wrap gap-2">
            {WALLETS.map((w) => (
              <LogoTile key={w.name} {...w} />
            ))}
          </ul>
          <h2 className="mt-6 mb-3 text-base font-bold text-white">{dict.delivery}</h2>
          <ul className="flex flex-wrap gap-2">
            {/* Couriers' logos are already on their own coloured squares: no white tile. */}
            {COURIERS.map((c) => (
              <li key={c.name} title={c.name}>
                <Image src={c.src} alt={c.name} width={48} height={48} className="size-12 rounded-md object-cover shadow-sm" />
              </li>
            ))}
          </ul>
        </section>

        {/* Follow */}
        <section>
          <Heading>{dict.follow}</Heading>
          <ul className="space-y-3.5">
            {social.map(({ href, label, icon: Icon, color }) => (
              <li key={label}>
                <a href={href} target="_blank" rel="noreferrer" className="flex w-fit items-center gap-2.5 hover:underline">
                  <span className="flex size-8 items-center justify-center rounded-full bg-white">
                    <Icon className={`size-[18px] ${color}`} />
                  </span>
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </section>

        {/* App */}
        <section className="order-5 col-span-2 lg:order-none lg:col-span-1">
          <Heading>{dict.getApp}</Heading>
          <ul className="flex flex-wrap gap-3 lg:flex-col">
            {[
              { src: "/images/footer/app-store.webp", name: "App Store" },
              { src: "/images/footer/google-play.webp", name: "Google Play" },
            ].map((s) => (
              <li key={s.name}>
                <Image src={s.src} alt={s.name} width={136} height={42} className="h-10 w-auto" />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-white/75">{dict.appSoon}</p>
        </section>
      </div>
      <p className="border-t border-white/20 py-5 text-center text-xs text-white/75">
        © {new Date().getFullYear()} Taladonline. {dict.rights}
      </p>
    </footer>
  );
}
