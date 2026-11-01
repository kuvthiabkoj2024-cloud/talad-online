import Image from "next/image";

/** The Vreview logo for green surfaces (transparent background); the name beside it says what it is, so no alt text. */
export function BrandLogo({ className }: { className?: string }) {
  return <Image src="/icons/logo-transparent.png" alt="" width={256} height={256} className={className} />;
}
