-- Add document metadata columns (from DocumentType)
ALTER TABLE "Document" ADD COLUMN "name" TEXT;
ALTER TABLE "Document" ADD COLUMN "description" TEXT;
ALTER TABLE "Document" ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Document" ADD COLUMN "expires" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Document" d
SET
  "name" = dt."name",
  "description" = dt."description",
  "required" = dt."required",
  "expires" = dt."expires"
FROM "DocumentType" dt
WHERE dt."id" = d."typeId";

-- Handle duplicate names within a project after copy (append short id if needed)
UPDATE "Document" d
SET "name" = d."name" || ' (' || LEFT(d."id", 8) || ')'
WHERE EXISTS (
  SELECT 1 FROM "Document" d2
  WHERE d2."projectId" = d."projectId"
    AND d2."name" = d."name"
    AND d2."id" < d."id"
);

ALTER TABLE "Document" ALTER COLUMN "name" SET NOT NULL;

-- Create ProjectWorkerDocument and migrate from ProjectWorkerDocumentType
CREATE TABLE "ProjectWorkerDocument" (
    "id" TEXT NOT NULL,
    "projectWorkerId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "ProjectWorkerDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectWorkerDocument_documentId_idx" ON "ProjectWorkerDocument"("documentId");
CREATE UNIQUE INDEX "ProjectWorkerDocument_projectWorkerId_documentId_key" ON "ProjectWorkerDocument"("projectWorkerId", "documentId");

INSERT INTO "ProjectWorkerDocument" ("id", "projectWorkerId", "documentId")
SELECT gen_random_uuid()::text, pwd."projectWorkerId", d."id"
FROM "ProjectWorkerDocumentType" pwd
JOIN "ProjectWorker" pw ON pw."id" = pwd."projectWorkerId"
JOIN "Document" d ON d."projectId" = pw."projectId" AND d."typeId" = pwd."typeId";

ALTER TABLE "ProjectWorkerDocument" ADD CONSTRAINT "ProjectWorkerDocument_projectWorkerId_fkey" FOREIGN KEY ("projectWorkerId") REFERENCES "ProjectWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectWorkerDocument" ADD CONSTRAINT "ProjectWorkerDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old join and type relations from Document
DROP TABLE "ProjectWorkerDocumentType";

ALTER TABLE "Document" DROP CONSTRAINT "Document_typeId_fkey";
DROP INDEX "Document_projectId_typeId_key";
ALTER TABLE "Document" DROP COLUMN "typeId";

DROP TABLE "DocumentType";

CREATE UNIQUE INDEX "Document_projectId_name_key" ON "Document"("projectId", "name");
