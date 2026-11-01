-- CreateEnum
CREATE TYPE "GuaranteeUnit" AS ENUM ('DAY', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "DepositType" AS ENUM ('AMOUNT', 'PERCENT');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'RETURN_DUE', 'RETURNED', 'KEPT');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "guaranteeDuration" INTEGER,
ADD COLUMN     "guaranteeTerms" TEXT,
ADD COLUMN     "guaranteeUnit" "GuaranteeUnit";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "depositType" "DepositType",
ADD COLUMN     "depositValue" DECIMAL(14,2),
ADD COLUMN     "guaranteeDuration" INTEGER,
ADD COLUMN     "guaranteeTerms" TEXT,
ADD COLUMN     "guaranteeUnit" "GuaranteeUnit";

-- AlterTable
ALTER TABLE "ShopOrder" ADD COLUMN     "depositAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "depositDueAt" TIMESTAMP(3),
ADD COLUMN     "depositRejectReason" TEXT,
ADD COLUMN     "depositSlipKey" TEXT,
ADD COLUMN     "depositStatus" "DepositStatus";
