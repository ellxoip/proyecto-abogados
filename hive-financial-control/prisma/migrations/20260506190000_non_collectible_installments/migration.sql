ALTER TABLE "Cuota"
ADD COLUMN "cobrable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "motivo_no_cobrable" VARCHAR(80);

CREATE INDEX "Cuota_cobrable_idx" ON "Cuota"("cobrable");
