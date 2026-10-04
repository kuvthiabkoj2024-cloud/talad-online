import { CardSkel, LineSkel, Skel, SkeletonPage, SummarySkel } from "@/components/skeletons";

/** Order detail skeleton: header, progress, items + timeline, delivery/payment/summary. */
export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-5">
      <Skel className="h-4 w-32" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skel className="h-3 w-20" />
          <Skel className="h-6 w-52" />
          <Skel className="h-4 w-40" />
        </div>
        <Skel className="h-6 w-28 rounded-full" />
      </div>
      <CardSkel className="grid grid-cols-6 gap-2 px-3 py-5 sm:px-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skel className="size-8 rounded-full" />
            <Skel className="h-3 w-12" />
          </div>
        ))}
      </CardSkel>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-5">
          <CardSkel className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <Skel className="h-4 w-36" />
            </div>
            <LineSkel />
            <LineSkel />
          </CardSkel>
          <CardSkel className="flex flex-col gap-3 p-4">
            <Skel className="h-4 w-32" />
            {Array.from({ length: 3 }, (_, i) => (
              <Skel key={i} className="h-4 w-1/2" />
            ))}
          </CardSkel>
        </div>
        <div className="flex flex-col gap-5">
          <CardSkel className="flex flex-col gap-2 p-4">
            <Skel className="h-4 w-32" />
            <Skel className="h-4 w-full" />
            <Skel className="h-4 w-3/4" />
          </CardSkel>
          <SummarySkel />
        </div>
      </div>
    </SkeletonPage>
  );
}
