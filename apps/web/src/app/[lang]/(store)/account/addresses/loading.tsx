import { CardSkel, HeadingSkel, Skel, SkeletonPage } from "@/components/skeletons";

/** Addresses skeleton. */
export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-3">
        <HeadingSkel />
        <Skel className="h-9 w-32 rounded-full" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 2 }, (_, i) => (
          <CardSkel key={i} className="flex flex-col gap-3 p-4">
            <div className="flex gap-3">
              <Skel className="size-10 shrink-0 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2">
                <Skel className="h-4 w-40" />
                <Skel className="h-3 w-32" />
                <Skel className="h-3 w-3/4" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border pt-2">
              <Skel className="h-6 w-14 rounded-full" />
              <Skel className="h-6 w-14 rounded-full" />
            </div>
          </CardSkel>
        ))}
      </div>
    </SkeletonPage>
  );
}
