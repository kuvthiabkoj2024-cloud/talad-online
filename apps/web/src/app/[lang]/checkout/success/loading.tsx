import { CardSkel, Skel, SkeletonPage } from "@/components/skeletons";

/** Order placed skeleton. */
export default function Loading() {
  return (
    <SkeletonPage className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8 sm:py-12">
      <CardSkel className="flex flex-col items-center gap-3 rounded-3xl px-6 py-8">
        <Skel className="size-16 rounded-full" />
        <Skel className="h-7 w-48" />
        <Skel className="h-4 w-64 max-w-full" />
        <Skel className="mt-2 h-12 w-full rounded-2xl" />
      </CardSkel>
      <Skel className="h-16 rounded-2xl" />
    </SkeletonPage>
  );
}
