import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Grid3x3, Users } from "lucide-react";
import { ProfileFollowers } from "@/components/profile/profile-followers";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileVideos } from "@/components/profile/profile-videos";
import { apiGet, type CustomerProfile, type ProfileFollowerPage, type ProfileVideoPage } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

type Props = PageProps<"/[lang]/u/[id]">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getProfile(id: string): Promise<CustomerProfile> {
  const profile = UUID.test(id) ? await apiGet<CustomerProfile>(`/profiles/${id}`) : null;
  if (!profile) notFound();
  return profile;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const profile = await getProfile(id);
  return { title: profile.name, description: `${profile.name} · Taladonline`, robots: { index: false } };
}

/** A customer's public video profile: who they are, their videos and their followers. */
export default async function ProfilePage({ params, searchParams }: Props) {
  const locale = await getLocale();
  const { profile: dict, feed, account } = await getDictionary();
  const { id } = await params;
  const tab = (await searchParams).tab === "followers" ? "followers" : "videos";
  const profile = await getProfile(id);
  const [videos, followers] = await Promise.all([
    tab === "videos" ? apiGet<ProfileVideoPage>(`/profiles/${id}/videos?limit=18`) : null,
    tab === "followers" ? apiGet<ProfileFollowerPage>(`/profiles/${id}/followers?limit=20`) : null,
  ]);
  const base = `/${locale}/u/${id}`;
  const tabs = [
    { key: "videos", label: dict.videos, count: profile.videos, icon: Grid3x3, href: base },
    { key: "followers", label: dict.followers, count: profile.followers, icon: Users, href: `${base}?tab=followers` },
  ] as const;

  return (
    <div className="mx-auto flex max-w-3xl flex-col pb-8 sm:gap-4 sm:px-4 sm:py-6">
      <ProfileHeader profile={profile} locale={locale} dict={dict} shareDict={feed} backLabel={account.backToAccount} />

      {/* overflow-clip (not hidden) rounds the corners without breaking the sticky tabs. */}
      <div className="bg-card sm:overflow-clip sm:rounded-3xl sm:shadow-sm sm:ring-1 sm:ring-border">
        {/* Tabs stay under the header while the grid scrolls. */}
        <nav aria-label={profile.name} className="sticky top-0 z-10 md:top-(--header-h) grid grid-cols-2 border-b border-border bg-card/95 backdrop-blur">
          {tabs.map(({ key, label, count, icon: Icon, href }) => {
            const selected = tab === key;
            return (
              <Link
                key={key}
                href={href}
                scroll={false}
                replace
                aria-current={selected ? "page" : undefined}
                className={`relative flex items-center justify-center gap-2 py-3.5 text-sm transition-colors ${
                  selected ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                {label}
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold leading-5 tabular-nums">{formatCount(count, locale)}</span>
                {selected && <span aria-hidden className="absolute inset-x-1/4 bottom-0 h-0.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>

        {tab === "videos" ? (
          <ProfileVideos key={id} customerId={id} initial={videos ?? { items: [], nextCursor: null }} locale={locale} dict={dict} />
        ) : (
          <ProfileFollowers key={id} customerId={id} initial={followers ?? { items: [], nextCursor: null, total: 0 }} locale={locale} dict={dict} />
        )}
      </div>
    </div>
  );
}
