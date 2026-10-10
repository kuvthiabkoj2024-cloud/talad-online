import type { Locale } from "@talad/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { apiGet } from "@/lib/api";
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
  return { title: page.title, description: page.body.replace(/^#\s+/gm, "").slice(0, 160) };
}

/** Plain-text CMS body: blank lines split blocks, "# " lines are headings. */
function Body({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) nodes.push(<p key={nodes.length}>{para.join(" ")}</p>);
    para = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith("# ")) {
      flush();
      nodes.push(
        <h2 key={nodes.length} className="pt-2 text-lg font-semibold text-foreground">
          {line.slice(2)}
        </h2>,
      );
    } else para.push(line);
  }
  flush();
  return <div className="flex flex-col gap-3 leading-relaxed text-muted-foreground">{nodes}</div>;
}

/** About / Terms / Privacy / FAQ (§5 footer links). */
export default async function CmsPageView({ params }: Props) {
  const locale = await getLocale();
  const { pages, catalog } = await getDictionary();
  const page = await getPage((await params).slug, locale);
  const updated = new Intl.DateTimeFormat(locale === "lo" ? "lo-LA" : "en-GB", { dateStyle: "long" }).format(new Date(page.updatedAt));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:py-10">
      <Breadcrumb items={[{ label: catalog.home, href: `/${locale}` }, { label: page.title }]} />
      <article className="flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:p-8">
        <header>
          <h1 className="text-2xl font-bold sm:text-3xl">{page.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{interpolate(pages.updated, { date: updated })}</p>
        </header>
        <Body text={page.body} />
      </article>
    </div>
  );
}
