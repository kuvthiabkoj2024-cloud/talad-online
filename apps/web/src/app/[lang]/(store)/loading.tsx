import { CardSkel, ProductGridSkel, Skel, SkeletonPage } from "@/components/skeletons";

/** Home page skeleton (§5): hero, seller strip, category bar, product grid. */
export default function Loading() {
  return (
    <SkeletonPage className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:py-8">
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Skel className="h-48 rounded-2xl sm:h-64 lg:h-80" />
        <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-1">
          <Skel className="h-36 rounded-2xl lg:h-auto" />
          <Skel className="h-36 rounded-2xl lg:h-auto" />
        </div>
      </div>
      <Skel className="h-40 rounded-2xl sm:h-24" />
      <CardSkel className="flex gap-3 overflow-hidden p-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex shrink-0 items-center gap-3 px-2 py-1.5">
            <Skel className="size-9 rounded-full" />
            <Skel className="h-4 w-20" />
          </div>
        ))}
      </CardSkel>
      <div className="mt-4">
        <ProductGridSkel />
      </div>
    </SkeletonPage>
  );
}
