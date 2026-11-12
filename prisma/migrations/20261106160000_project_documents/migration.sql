-- Document rules (required, expires, description) belong to the project link.
-- The requirement name stays the shared identity of the worker's file.

CREATE TABLE "ProjectDocument" (
    "id" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "expires" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectDocument_projectId_requirementId_key" ON "ProjectDocument"("projectId", "requirementId");
CREATE INDEX "ProjectDocument_projectId_idx" ON "ProjectDocument"("projectId");
CREATE INDEX "ProjectDocument_requirementId_idx" ON "ProjectDocument"("requirementId");

ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectDocument" ADD CONSTRAINT "ProjectDocument_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ProjectDocument" ("id", "description", "required", "expires", "projectId", "requirementId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, r."description", r."required", r."expires", p."id", r."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Requirement" r
JOIN "Project" p ON p."contractorId" = r."contractorId";

ALTER TABLE "Requirement" DROP COLUMN "description",
DROP COLUMN "required",
DROP COLUMN "expires";
