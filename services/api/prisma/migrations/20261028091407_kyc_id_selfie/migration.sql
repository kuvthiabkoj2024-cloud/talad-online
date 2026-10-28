-- AlterEnum
ALTER TYPE "KycDocumentType" ADD VALUE 'ID_SELFIE';

-- Tax certificates are no longer asked for: keep any uploaded as "other documents".
UPDATE "ShopKycDocument" SET "type" = 'OTHER' WHERE "type" = 'TAX_CERTIFICATE';
