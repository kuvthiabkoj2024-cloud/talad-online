import type { Metadata } from "next";
import { NewPostForm } from "@/components/feed/new-post-form";
import { requireCustomer } from "@/lib/require-customer";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { feedPost } = await getDictionary();
  return { title: feedPost.title, robots: { index: false } };
}

/** Post your own video to the feed — no product needed. */
export default async function NewPostPage() {
  const locale = await getLocale();
  const { feedPost } = await getDictionary();
  await requireCustomer(locale, `/${locale}/feed/new`);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6 sm:py-8">
      <NewPostForm locale={locale} dict={feedPost} />
    </div>
  );
}
