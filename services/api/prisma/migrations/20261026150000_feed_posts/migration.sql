-- Customers post their own videos to the feed (no product), and like them.
CREATE TABLE "FeedPost" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "videoKey" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeedPostLike" (
    "customerId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedPostLike_pkey" PRIMARY KEY ("customerId","postId")
);

CREATE INDEX "FeedPost_createdAt_idx" ON "FeedPost"("createdAt");
CREATE INDEX "FeedPost_customerId_createdAt_idx" ON "FeedPost"("customerId", "createdAt");

ALTER TABLE "FeedPost" ADD CONSTRAINT "FeedPost_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedPostLike" ADD CONSTRAINT "FeedPostLike_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedPostLike" ADD CONSTRAINT "FeedPostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
