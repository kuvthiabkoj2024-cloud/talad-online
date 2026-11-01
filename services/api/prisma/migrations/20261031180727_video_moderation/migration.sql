-- AlterTable
ALTER TABLE "FeedPost" ADD COLUMN     "hiddenAt" TIMESTAMP(3),
ADD COLUMN     "hiddenReason" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "videoHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "videoHiddenAt" TIMESTAMP(3),
ADD COLUMN     "videoHiddenReason" TEXT;

-- Admins who moderate products can moderate videos too.
UPDATE "AdminRole" SET permissions = array_append(permissions, 'videos') WHERE 'products' = ANY(permissions) AND NOT 'videos' = ANY(permissions);
UPDATE "AdminUser" SET permissions = array_append(permissions, 'videos') WHERE 'products' = ANY(permissions) AND NOT 'videos' = ANY(permissions);
