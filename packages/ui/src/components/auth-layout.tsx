import type { LucideIcon } from "lucide-react"

import { cn } from "cn"

export interface AuthHighlight {
  icon: LucideIcon
  title: string
  body: string
}

/**
 * Sign-in / account-recovery frame for the dashboards: a branded panel (headline,
 * highlights) beside the form on wide screens, a compact branded header on phones.
 */
function AuthLayout({
  logo: Logo,
  brand,
  badge,
  headline,
  tagline,
  highlights,
  footnote,
  aside,
  children,
}: {
  logo: LucideIcon
  brand: string
  badge: string
  headline: string
  tagline: string
  highlights: AuthHighlight[]
  /** Small print under the panel, e.g. "© 2026 Taladonline". */
  footnote?: React.ReactNode
  /** Extra controls in the form column's top-right corner (e.g. a language switch). */
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  const mark = (
    <span className="flex items-center gap-2.5 text-xl font-bold">
      <span className="flex size-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
        <Logo className="size-5.5" strokeWidth={2.25} />
      </span>
      {brand}
      <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-xs font-semibold">{badge}</span>
    </span>
  )

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel: full height on desktop, a short header on phones. */}
      {/* Fixed deep brand green in both themes, so white text always reads well. */}
      <section className="relative isolate overflow-hidden bg-linear-to-br from-[oklch(0.52_0.13_145)] to-[oklch(0.36_0.09_152)] text-white">
        <BrandBackdrop />
        <div className="relative flex h-full flex-col px-6 pt-8 pb-16 sm:px-10 lg:px-14 lg:py-12">
          {mark}
          <div className="mt-8 max-w-lg lg:mt-auto">
            <p className="text-2xl leading-tight font-bold text-balance sm:text-3xl lg:text-[2.6rem]">{headline}</p>
            <p className="mt-3 text-sm text-white/80 sm:text-base">{tagline}</p>
          </div>
          <ul className="mt-10 hidden max-w-lg gap-3 lg:grid">
            {highlights.map((h) => (
              <li key={h.title} className="flex items-start gap-3.5 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <h.icon className="size-5" />
                </span>
                <span>
                  <span className="block font-semibold">{h.title}</span>
                  <span className="block text-sm text-white/75">{h.body}</span>
                </span>
              </li>
            ))}
          </ul>
          {footnote && <p className="mt-10 hidden text-xs text-white/60 lg:mt-auto lg:block lg:pt-10">{footnote}</p>}
        </div>
      </section>

      {/* Form column; on phones the card overlaps the brand header. */}
      <main className="relative flex flex-col px-4 pb-10 sm:px-8 lg:px-12">
        {aside && <div className="flex justify-end pt-4 lg:pt-6">{aside}</div>}
        <div className="-mt-10 flex flex-1 items-start justify-center lg:mt-0 lg:items-center">
          <div
            className={cn(
              "relative w-full max-w-md rounded-3xl border bg-card p-6 shadow-xl shadow-primary/5 sm:p-8",
              "lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
              // Roomier controls and a bigger, left-aligned title than the dashboard forms.
              "[&_[data-slot=button][data-size=lg]]:h-11 [&_[data-slot=input]]:h-11 [&_h1]:text-2xl [&_h1]:font-bold lg:[&_h1]:text-3xl",
            )}
          >
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}

/** Soft rings and a dot grid behind the brand panel (decorative). */
function BrandBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,oklch(1_0_0/0.18),transparent_60%)]" />
      <div className="absolute -right-24 -bottom-32 size-[28rem] rounded-full border-[3rem] border-white/8" />
      <div className="absolute -top-20 -right-10 size-64 rounded-full bg-white/8 blur-2xl" />
      <div className="absolute inset-0 bg-[radial-gradient(oklch(1_0_0/0.14)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
    </div>
  )
}

export { AuthLayout }
