-- Cash on delivery becomes a per-shop choice (off until the owner accepts the COD terms).
ALTER TABLE "Shop" ADD COLUMN "codEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "codTermsAcceptedAt" TIMESTAMP(3);
