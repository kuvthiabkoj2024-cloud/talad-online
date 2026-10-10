import { SkeletonPage } from "@/components/skeletons";
import { FEED_HEIGHT } from "@/components/feed/feed-height";

/** Feed skeleton: one dark full-height slide. */
export default function Loading() {
  return (
    <SkeletonPage className={`${FEED_HEIGHT} bg-black`}>
      <div className="mx-auto h-full max-w-md animate-pulse bg-white/5" />
    </SkeletonPage>
  );
}
