import { CardSkel, HeadingSkel, Skel, SkeletonPage } from "@/components/skeletons";

/** Profile skeleton: profile card, personal info, sign-in methods. */
export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-5">
      <HeadingSkel />
      <CardSkel className="overflow-hidden">
        <Skel className="h-16 rounded-none sm:h-20" />
        <div className="flex flex-col items-center gap-3 px-5 pb-5 sm:flex-row sm:items-end">
          <div className="relative z-10 -mt-10 size-20 rounded-full bg-card p-1">
            <Skel className="size-full rounded-full" />
          </div>
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <Skel className="h-5 w-40" />
            <Skel className="h-4 w-32" />
          </div>
        </div>
      </CardSkel>
      {[3, 3].map((rows, i) => (
        <CardSkel key={i} className="flex flex-col gap-1 p-2">
          <Skel className="mx-4 my-3 h-4 w-32" />
          {Array.from({ length: rows }, (_, j) => (
            <div key={j} className="flex items-center gap-4 px-4 py-3">
              <Skel className="size-10 rounded-xl" />
              <div className="flex flex-col gap-2">
                <Skel className="h-3 w-20" />
                <Skel className="h-4 w-40" />
              </div>
            </div>
          ))}
        </CardSkel>
      ))}
    </SkeletonPage>
  );
}
