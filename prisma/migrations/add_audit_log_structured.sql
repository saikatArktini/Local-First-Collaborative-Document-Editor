-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('DOCUMENT_CREATED', 'DOCUMENT_DELETED', 'ROLE_CHANGED', 'SNAPSHOT_CREATED', 'RESTORE_PERFORMED');

-- AlterTable: change action from text to enum, add documentId and metadata
ALTER TABLE "AuditLog" 
  ALTER COLUMN "action" DROP DEFAULT;

-- Step 1: Add new columns
ALTER TABLE "AuditLog" 
  ADD COLUMN "documentId" TEXT,
  ADD COLUMN "metadata"   JSONB;

-- Step 2: Migrate existing free-text action rows to nearest enum value
-- (Map any existing rows to DOCUMENT_CREATED as a safe default for migration)
ALTER TABLE "AuditLog" 
  ADD COLUMN "action_new" "AuditAction";

UPDATE "AuditLog" SET "action_new" = 'DOCUMENT_CREATED';

ALTER TABLE "AuditLog"
  DROP COLUMN "action",
  ALTER COLUMN "action_new" SET NOT NULL;

ALTER TABLE "AuditLog"
  RENAME COLUMN "action_new" TO "action";

-- Step 3: Add foreign key for documentId
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL;

-- AddIndex (optional, for performance on document-scoped queries)
CREATE INDEX "AuditLog_documentId_idx" ON "AuditLog"("documentId");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
