import { CardSkel, HeadingSkel, LineSkel, Skel, SkeletonPage, SummarySkel } from "@/components/skeletons";

/** Cart skeleton: items grouped by shop + summary. */
export default function Loading() {
  return (
    <SkeletonPage className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:py-8">
      <HeadingSkel />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-3">
          <Skel className="h-12 rounded-2xl" />
          {[2, 1].map((rows, i) => (
            <CardSkel key={i} className="overflow-hidden">
              <div className="border-b border-border px-4 py-3">
                <Skel className="h-4 w-36" />
              </div>
              {Array.from({ length: rows }, (_, j) => (
                <LineSkel key={j} thumb="size-20" />
              ))}
            </CardSkel>
          ))}
        </div>
        <div className="hidden lg:block">
          <SummarySkel />
        </div>
      </div>
    </SkeletonPage>
  );
}
