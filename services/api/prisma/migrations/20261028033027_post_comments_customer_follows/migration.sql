-- AlterTable
ALTER TABLE "FeedPost" ADD COLUMN     "commentCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VideoComment" ADD COLUMN     "postId" TEXT,
ALTER COLUMN "productId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CustomerFollow" (
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFollow_pkey" PRIMARY KEY ("followerId","followingId")
);

-- CreateIndex
CREATE INDEX "CustomerFollow_followingId_createdAt_idx" ON "CustomerFollow"("followingId", "createdAt");

-- CreateIndex
CREATE INDEX "VideoComment_postId_parentId_createdAt_idx" ON "VideoComment"("postId", "parentId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerFollow" ADD CONSTRAINT "CustomerFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFollow" ADD CONSTRAINT "CustomerFollow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoComment" ADD CONSTRAINT "VideoComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "FeedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every comment belongs to exactly one video: a product video or a customer post.
ALTER TABLE "VideoComment" ADD CONSTRAINT "VideoComment_one_target" CHECK (num_nonnulls("productId", "postId") = 1);
