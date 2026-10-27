-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" TEXT,
    "status" "ContractorStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "contractorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "contractorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectWorker" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectWorker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_contractorId_idx" ON "Project"("contractorId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Worker_contractorId_idx" ON "Worker"("contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_contractorId_documentId_key" ON "Worker"("contractorId", "documentId");

-- CreateIndex
CREATE INDEX "ProjectWorker_workerId_idx" ON "ProjectWorker"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWorker_projectId_workerId_key" ON "ProjectWorker"("projectId", "workerId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorker" ADD CONSTRAINT "ProjectWorker_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorker" ADD CONSTRAINT "ProjectWorker_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed one default project per contractor that has documents (or all contractors)
INSERT INTO "Project" ("id", "name", "description", "status", "isActive", "contractorId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       'Proyecto general',
       'Proyecto migrado automaticamente desde documentos del contratista',
       c."status",
       true,
       c."id",
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Contractor" c;

-- Add nullable projectId, backfill, then enforce NOT NULL
ALTER TABLE "Document" ADD COLUMN "projectId" TEXT;

UPDATE "Document" d
SET "projectId" = p."id"
FROM "Project" p
WHERE p."contractorId" = d."contractorId"
  AND p."name" = 'Proyecto general';

-- Drop old contractor FK/unique and column
ALTER TABLE "Document" DROP CONSTRAINT "Document_contractorId_fkey";
DROP INDEX "Document_contractorId_typeId_key";
ALTER TABLE "Document" DROP COLUMN "contractorId";

-- Enforce projectId
ALTER TABLE "Document" ALTER COLUMN "projectId" SET NOT NULL;

CREATE UNIQUE INDEX "Document_projectId_typeId_key" ON "Document"("projectId", "typeId");

ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
