-- CreateTable
CREATE TABLE "ProjectWorkerDocumentType" (
    "id" TEXT NOT NULL,
    "projectWorkerId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,

    CONSTRAINT "ProjectWorkerDocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectWorkerDocumentType_typeId_idx" ON "ProjectWorkerDocumentType"("typeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectWorkerDocumentType_projectWorkerId_typeId_key" ON "ProjectWorkerDocumentType"("projectWorkerId", "typeId");

-- AddForeignKey
ALTER TABLE "ProjectWorkerDocumentType" ADD CONSTRAINT "ProjectWorkerDocumentType_projectWorkerId_fkey" FOREIGN KEY ("projectWorkerId") REFERENCES "ProjectWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectWorkerDocumentType" ADD CONSTRAINT "ProjectWorkerDocumentType_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "DocumentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: assign all active project document types to existing project-worker links
INSERT INTO "ProjectWorkerDocumentType" ("id", "projectWorkerId", "typeId")
SELECT gen_random_uuid()::text, pw."id", d."typeId"
FROM "ProjectWorker" pw
JOIN "Document" d ON d."projectId" = pw."projectId"
JOIN "DocumentType" dt ON dt."id" = d."typeId" AND dt."isActive" = true;
