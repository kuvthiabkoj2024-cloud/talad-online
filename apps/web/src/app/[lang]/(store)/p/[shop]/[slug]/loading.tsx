import { CardSkel, ProductGridSkel, Skel, SkeletonPage } from "@/components/skeletons";

/** Product detail skeleton: gallery + purchase panel, then shop card and related products. */
export default function Loading() {
  return (
    <SkeletonPage className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pb-28 pt-4 sm:pb-8 sm:pt-6">
      <Skel className="h-4 w-64 max-w-full" />
      <CardSkel className="grid gap-6 p-4 sm:p-6 md:grid-cols-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10">
        <div className="flex flex-col gap-3">
          <Skel className="aspect-square rounded-xl" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skel key={i} className="size-16 rounded-lg sm:size-20" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <Skel className="h-4 w-32" />
          <div className="flex flex-col gap-2">
            <Skel className="h-7 w-full" />
            <Skel className="h-7 w-2/3" />
          </div>
          <Skel className="h-10 w-48" />
          <Skel className="h-16 w-full max-w-sm rounded-xl" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skel key={i} className="h-10 w-24 rounded-lg" />
            ))}
          </div>
          <Skel className="h-11 w-36 rounded-lg" />
          <div className="grid max-w-md grid-cols-2 gap-3">
            <Skel className="h-12 rounded-full sm:h-14" />
            <Skel className="h-12 rounded-full sm:h-14" />
          </div>
        </div>
      </CardSkel>
      <CardSkel className="flex items-center gap-4 p-4 sm:p-6">
        <Skel className="size-14 rounded-full sm:size-20" />
        <div className="flex flex-1 flex-col gap-2">
          <Skel className="h-5 w-40" />
          <Skel className="h-4 w-28" />
        </div>
      </CardSkel>
      <ProductGridSkel count={6} />
    </SkeletonPage>
  );
}
