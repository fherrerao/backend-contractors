-- Documents were removed in the previous migration, so stored project and
-- contractor statuses no longer describe worker compliance.
UPDATE "Worker" SET "status" = 'INCOMPLETE';
UPDATE "Project" SET "status" = 'INCOMPLETE';
UPDATE "Contractor" SET "status" = 'INCOMPLETE';
