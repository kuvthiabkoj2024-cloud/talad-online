import { CardSkel, Skel, SkeletonPage } from "@/components/skeletons";

/** Account hub skeleton: profile banner, order shortcuts, menu rows. */
export default function Loading() {
  return (
    <SkeletonPage className="flex flex-col gap-5">
      <Skel className="h-24 rounded-2xl" />
      <CardSkel className="flex flex-col gap-3 p-4">
        <Skel className="h-4 w-28" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Skel className="size-7 rounded-lg" />
              <Skel className="h-3 w-12" />
            </div>
          ))}
        </div>
      </CardSkel>
      <CardSkel className="flex flex-col">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <Skel className="size-5 rounded-md" />
            <Skel className="h-4 w-36" />
          </div>
        ))}
      </CardSkel>
    </SkeletonPage>
  );
}
