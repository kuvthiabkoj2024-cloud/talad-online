import { CardSkel, HeadingSkel, LineSkel, Skel, SkeletonPage, SummarySkel } from "@/components/skeletons";

/** Checkout skeleton: items per shop, address, courier, payment method, summary. */
export default function Loading() {
  return (
    <SkeletonPage className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:py-8">
      <Skel className="h-4 w-28" />
      <HeadingSkel />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="flex flex-col gap-4">
          <CardSkel className="overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <Skel className="h-4 w-36" />
            </div>
            <LineSkel thumb="size-14" />
            <LineSkel thumb="size-14" />
          </CardSkel>
          <CardSkel className="flex flex-col gap-3 p-4">
            <Skel className="h-6 w-40" />
            <Skel className="h-4 w-56" />
            <Skel className="h-4 w-3/4" />
          </CardSkel>
          <CardSkel className="flex flex-col gap-3 p-4">
            <Skel className="h-6 w-40" />
            <div className="grid gap-2 sm:grid-cols-3">
              <Skel className="h-16 rounded-xl" />
              <Skel className="h-16 rounded-xl" />
              <Skel className="h-16 rounded-xl" />
            </div>
          </CardSkel>
          <CardSkel className="flex flex-col gap-3 p-4">
            <Skel className="h-6 w-40" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Skel className="h-16 rounded-xl" />
              <Skel className="h-16 rounded-xl" />
            </div>
          </CardSkel>
        </div>
        <div className="hidden lg:block">
          <SummarySkel />
        </div>
      </div>
    </SkeletonPage>
  );
}
