/*
  Warnings:

  - You are about to drop the column `category` on the `cases` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "cases_category_idx";

-- AlterTable
ALTER TABLE "cases" DROP COLUMN "category",
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "is_delicate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "secondary_code" TEXT;

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "cases_categoryId_idx" ON "cases"("categoryId");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
