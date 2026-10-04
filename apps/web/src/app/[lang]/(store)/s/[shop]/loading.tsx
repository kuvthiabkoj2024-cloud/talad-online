import { CardSkel, ProductGridSkel, Skel, SkeletonPage } from "@/components/skeletons";

/** Shop storefront skeleton: cover + profile, search, product grid. */
export default function Loading() {
  return (
    <SkeletonPage className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:py-8">
      <CardSkel className="overflow-hidden rounded-3xl">
        <Skel className="h-32 rounded-none sm:h-44" />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:gap-5 sm:px-6">
          <div className="relative z-10 -mt-12 size-24 shrink-0 rounded-2xl bg-card p-1 shadow-lg sm:-mt-14 sm:size-28">
            <Skel className="size-full rounded-xl" />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Skel className="h-7 w-52" />
            <Skel className="h-4 w-72 max-w-full" />
          </div>
          <Skel className="h-10 w-36 rounded-full" />
        </div>
      </CardSkel>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Skel className="h-7 w-40" />
        <Skel className="h-11 w-full rounded-full lg:w-80" />
      </div>
      <ProductGridSkel title={false} />
    </SkeletonPage>
  );
}
