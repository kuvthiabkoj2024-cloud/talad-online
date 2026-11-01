import type { Locale } from "@talad/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronDown, CircleHelp, FileText, ShieldCheck, Store, type LucideIcon } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { FaqAccordion } from "@/components/faq-accordion";
import { apiGet } from "@/lib/api";
import { isHtml, parseCmsBody, type CmsDocument, type CmsSection } from "@/lib/cms-page";
import { interpolate } from "@/lib/format";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

// Admins edit these in the console (§2.11); refresh at most every 5 minutes.
export const revalidate = 300;

type Props = PageProps<"/[lang]/pages/[slug]">;

interface CmsPage {
  slug: string;
  content: Partial<Record<Locale, { title: string; body: string }>>;
  updatedAt: string;
}

async function getPage(slug: string, locale: Locale) {
  const page = await apiGet<CmsPage>(`/pages/${encodeURIComponent(slug)}`);
  const text = page && (page.content[locale] ?? page.content.lo ?? page.content.en);
  if (!page || !text) notFound();
  return { ...text, updatedAt: page.updatedAt };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPage((await params).slug, await getLocale());
  const text = isHtml(page.body) ? page.body.replace(/<[^>]+>/g, " ") : page.body.replace(/^#\s+/gm, "");
  return { title: page.title, description: text.replace(/\s+/g, " ").trim().slice(0, 160) };
}

const cn = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

const ICONS: Record<string, LucideIcon> = { about: Store, terms: FileText, privacy: ShieldCheck, faq: CircleHelp };

const Html = ({ html, className }: { html: string; className?: string }) => <div className={cn("cms-body", className)} dangerouslySetInnerHTML={{ __html: html }} />;

/** Links to the sections: a sticky column on large screens, collapsed above the article on phones. */
function Contents({ sections, label }: { sections: CmsSection[]; label: string }) {
  // Articles sit under their part; ones before the first part have nothing to be indented from.
  const firstPart = sections.findIndex((s) => s.level === 2);
  const links = (
    <ol className="flex flex-col gap-0.5 text-sm">
      {sections.map((s, i) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className={cn(
              "block rounded-lg px-3 py-1.5 transition-colors hover:bg-primary/10 hover:text-primary",
              s.level === 2 ? "font-semibold text-foreground" : "text-muted-foreground",
              s.level === 3 && firstPart >= 0 && i > firstPart && "pl-6",
            )}
          >
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <details className="group rounded-2xl border border-border bg-card lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold [&::-webkit-details-marker]:hidden">
          {label}
          <ChevronDown className="size-5 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="max-h-96 overflow-y-auto border-t border-border p-2">{links}</div>
      </details>
      <aside className="sticky top-28 hidden max-h-[calc(100dvh-8rem)] flex-col rounded-2xl border border-border bg-card lg:flex">
        <p className="border-b border-border px-5 py-4 font-semibold">{label}</p>
        <div className="overflow-y-auto p-2">{links}</div>
      </aside>
    </>
  );
}

/** Terms and Privacy: one long read with its table of contents alongside. */
function Article({ doc, contents }: { doc: CmsDocument; contents: string }) {
  const hasContents = doc.sections.length > 1;
  return (
    <div className={cn("grid items-start gap-5", hasContents && "lg:grid-cols-[20rem_minmax(0,1fr)]")}>
      {hasContents && <Contents sections={doc.sections} label={contents} />}
      <article className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-5 sm:p-8 lg:p-10">
        {doc.intro && <Html html={doc.intro} />}
        {doc.sections.map((s, i) =>
          s.level === 2 ? (
            <section key={s.id} className={cn("flex scroll-mt-28 flex-col gap-3", (i > 0 || doc.intro !== "") && "border-t border-border pt-6")} id={s.id}>
              <h2 className="text-xl font-bold sm:text-2xl">{s.title}</h2>
              {s.html && <Html html={s.html} />}
            </section>
          ) : (
            <section key={s.id} className="flex scroll-mt-28 flex-col gap-2" id={s.id}>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              {s.html && <Html html={s.html} />}
            </section>
          ),
        )}
      </article>
    </div>
  );
}

/** About: a lead paragraph, then each section as a card. */
function About({ doc }: { doc: CmsDocument }) {
  return (
    <div className="flex flex-col gap-5">
      {doc.intro && <Html html={doc.intro} className="rounded-2xl border border-border bg-card p-6 text-lg sm:p-10 sm:text-xl" />}
      {doc.sections.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          {doc.sections.map((s, i) => (
            <section key={s.id} className={cn("flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 sm:p-8", doc.sections.length % 2 === 1 && i === doc.sections.length - 1 && "md:col-span-2")}>
              <h2 className="border-l-4 border-primary pl-3 text-xl font-bold">{s.title}</h2>
              {s.html && <Html html={s.html} />}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** FAQ: each heading is a question. */
function Faq({ doc }: { doc: CmsDocument }) {
  return (
    <div className="flex flex-col gap-3">
      {doc.intro && <Html html={doc.intro} className="rounded-2xl border border-border bg-card p-5 sm:p-8" />}
      <FaqAccordion items={doc.sections} />
    </div>
  );
}

/** About / Terms / Privacy / FAQ (§5 footer links). */
export default async function CmsPageView({ params }: Props) {
  const { slug } = await params;
  const locale = await getLocale();
  const { pages, catalog } = await getDictionary();
  const page = await getPage(slug, locale);
  const updated = new Intl.DateTimeFormat(locale === "lo" ? "lo-LA" : "en-GB", { dateStyle: "long" }).format(new Date(page.updatedAt));
  const doc = parseCmsBody(page.body);
  const Icon = ICONS[slug] ?? FileText;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:py-8">
      <Breadcrumb items={[{ label: catalog.home, href: `/${locale}` }, { label: page.title }]} />
      <header className="flex items-center gap-4 rounded-2xl bg-primary/10 p-6 sm:gap-6 sm:p-10">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground sm:size-16">
          <Icon className="size-6 sm:size-8" />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-4xl">{page.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{interpolate(pages.updated, { date: updated })}</p>
        </div>
      </header>
      {slug === "faq" && doc.sections.length > 0 ? <Faq doc={doc} /> : slug === "about" ? <About doc={doc} /> : <Article doc={doc} contents={pages.contents} />}
    </div>
  );
}
