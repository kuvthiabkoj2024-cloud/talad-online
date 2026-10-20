import { CardSkel, HeadingSkel, LineSkel, Skel, SkeletonPage } from "@/components/skeletons";

/** Order history skeleton: tabs + order cards. */
export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-5">
      <HeadingSkel />
      <CardSkel className="flex gap-2 overflow-hidden p-1.5">
        {Array.from({ length: 7 }, (_, i) => (
          <Skel key={i} className="h-9 w-24 shrink-0 rounded-xl" />
        ))}
      </CardSkel>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <CardSkel key={i} className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <Skel className="h-4 w-36" />
              <Skel className="h-5 w-24 rounded-full" />
            </div>
            <LineSkel thumb="size-14" />
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <Skel className="h-3 w-40" />
              <Skel className="h-6 w-28 rounded-full" />
            </div>
          </CardSkel>
        ))}
      </div>
    </SkeletonPage>
  );
}
