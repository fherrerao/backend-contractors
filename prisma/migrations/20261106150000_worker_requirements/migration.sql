-- Los documentos dejan de pertenecer al proyecto. El catalogo vive en el contratista
-- y cada trabajador tiene su propio archivo por requisito.
DROP TABLE IF EXISTS "ProjectWorkerDocument";

DELETE FROM "DocumentReview";
DELETE FROM "Document";

ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_projectId_fkey";
ALTER TABLE "Document" DROP CONSTRAINT IF EXISTS "Document_projectId_name_key";
DROP INDEX IF EXISTS "Document_projectId_name_key";

ALTER TABLE "Document" DROP COLUMN "projectId";
ALTER TABLE "Document" DROP COLUMN "name";
ALTER TABLE "Document" DROP COLUMN "description";
ALTER TABLE "Document" DROP COLUMN "required";
ALTER TABLE "Document" DROP COLUMN "expires";

ALTER TABLE "Worker" ADD COLUMN "status" "ContractorStatus" NOT NULL DEFAULT 'INCOMPLETE';
CREATE INDEX "Worker_status_idx" ON "Worker"("status");

CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "expires" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "contractorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Requirement_contractorId_name_key" ON "Requirement"("contractorId", "name");
CREATE INDEX "Requirement_contractorId_idx" ON "Requirement"("contractorId");

ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document" ADD COLUMN "workerId" TEXT NOT NULL;
ALTER TABLE "Document" ADD COLUMN "requirementId" TEXT NOT NULL;

CREATE UNIQUE INDEX "Document_workerId_requirementId_key" ON "Document"("workerId", "requirementId");
CREATE INDEX "Document_workerId_idx" ON "Document"("workerId");
CREATE INDEX "Document_requirementId_idx" ON "Document"("requirementId");

ALTER TABLE "Document" ADD CONSTRAINT "Document_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
