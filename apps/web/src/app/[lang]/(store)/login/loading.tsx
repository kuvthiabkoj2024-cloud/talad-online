import { CardSkel, Skel, SkeletonPage } from "@/components/skeletons";

/** Sign-in / sign-up skeleton. */
export default function Loading() {
  return (
    <SkeletonPage className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:py-12 lg:grid-cols-[1fr_minmax(0,28rem)] lg:gap-10">
      <Skel className="hidden min-h-[32rem] rounded-3xl lg:block" />
      <CardSkel className="flex flex-col gap-5 rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col items-center gap-2">
          <Skel className="h-7 w-48" />
          <Skel className="h-4 w-64 max-w-full" />
        </div>
        <Skel className="h-11 rounded-full" />
        <Skel className="h-12 rounded-xl" />
        <Skel className="h-12 rounded-full" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skel className="h-12 rounded-full" />
          <Skel className="h-12 rounded-full" />
        </div>
      </CardSkel>
    </SkeletonPage>
  );
}
