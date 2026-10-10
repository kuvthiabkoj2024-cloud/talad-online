import { CardSkel, HeadingSkel, Skel, SkeletonPage } from "@/components/skeletons";

/** Notifications skeleton: tabs + a list of rows. */
export default function Loading() {
  return (
    <SkeletonPage className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:py-8">
      <HeadingSkel />
      <CardSkel className="flex gap-2 overflow-hidden p-1.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skel key={i} className="h-9 w-24 shrink-0 rounded-xl" />
        ))}
      </CardSkel>
      <Skel className="h-3 w-16" />
      <CardSkel className="flex flex-col divide-y divide-border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-start gap-3 px-4 py-3.5">
            <Skel className="size-12 shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-2 pt-0.5">
              <Skel className="h-4 w-2/3" />
              <Skel className="h-3 w-full" />
            </div>
          </div>
        ))}
      </CardSkel>
    </SkeletonPage>
  );
}
