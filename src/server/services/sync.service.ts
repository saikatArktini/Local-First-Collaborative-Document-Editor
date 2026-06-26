import { syncRepository } from '@/server/repositories/sync.repository';
import { versionRepository } from '@/server/repositories/version.repository';
import { auditRepository } from '@/server/repositories/audit.repository';
import { canRead, canEdit, canSync } from '@/server/permissions/document.permissions';
import { mergeCRDTUpdates } from '@/lib/crdt';
import { broadcastUpdate } from '@/lib/broadcast';
import { AppError, ErrorCode, isPrismaUniqueConstraintError } from '@/lib/errors';
import { withRetry } from '@/lib/retry';
import prisma from '@/lib/prisma';
import * as Y from 'yjs';
import { Role, AuditAction } from '@prisma/client';

/**
 * SyncService
 * Encapsulates the core coordination of local-first collaborative sync logic,
 * document conflict detection/rebasing, version snapshots creation, and snapshot restores.
 */
export class SyncService {
  /**
   * Fetch all changes for a document since a specific version, verifying user sync access.
   * Converts the binary database buffers into hex strings for transport serialization over JSON.
   */
  async getChanges(documentId: string, userId: string, sinceVersion: number) {
    const hasSyncAccess = await canSync(documentId, userId);
    if (!hasSyncAccess) {
      throw new Error('Access denied: You do not have permission to access this document sync log');
    }

    const operations = await syncRepository.findOperations(documentId, userId, sinceVersion);
    return operations.map((op) => ({
      id: op.id,
      clientId: op.clientId,
      version: op.version,
      change: Buffer.from(op.operation).toString('hex'), // Convert binary to hex string for JSON transport
    }));
  }

  /**
   * Submit a new change delta for a document. Enforces edit/write permission.
   * If the sequence version number already exists (conflict caused by parallel offline edits),
   * returns a VERSION_CONFLICT payload so the client can re-fetch newer operations and rebase.
   */
  async submitChange(documentId: string, userId: string, clientId: string, version: number, changeHex: string) {
    const hasEditAccess = await canEdit(documentId, userId);
    if (!hasEditAccess) {
      throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to sync edits to this document');
    }

    const changeBuffer = Buffer.from(changeHex, 'hex');

    try {
      // Create new sync operation sequence block in database. Wrapped in db retries for locking resilience.
      const savedOp = await withRetry(() =>
        syncRepository.createOperation(documentId, userId, clientId, version, changeBuffer)
      );

      // Broadcast update to other active subscribers in real-time
      broadcastUpdate(documentId, { clientId, version, change: changeHex });

      return {
        success: true,
        version: savedOp.version,
      };
    } catch (error: any) {
      // Prisma P2002 represents a unique constraint violation on (documentId, version).
      // This indicates a conflict because another client incremented the sequence version.
      if (isPrismaUniqueConstraintError(error)) {
        try {
          const existingOp = await prisma.syncOperation.findUnique({
            where: {
              documentId_version: {
                documentId,
                version,
              },
            },
          });
          
          // Idempotency check: if the operation was already registered by the SAME client, return success.
          if (existingOp && existingOp.clientId === clientId) {
            return {
              success: true,
              version,
            };
          }
        } catch (dbErr) {
          console.error('[SyncService] Failed to check for duplicate sync operation:', dbErr);
        }

        // Return conflict metadata containing the latest version to prompt client alignment/rebase
        const latestVersion = await syncRepository.getLatestVersion(documentId, userId);
        return {
          success: false,
          error: 'VERSION_CONFLICT',
          latestVersion,
          message: `Version conflict: version ${version} already exists. Latest server version is ${latestVersion}.`,
        };
      }

      // Log irrecoverable sync failure to audit log (fire-and-forget, don't block throw)
      auditRepository
        .logAction(userId, AuditAction.SYNC_FAILED, documentId, {
          clientId,
          version,
          error: error instanceof Error ? error.message : String(error),
        })
        .catch((auditErr) => console.error('[SyncService] Failed to write SYNC_FAILED audit log:', auditErr));

      throw error;
    }
  }

  /**
   * Submit a batch of offline changes/sync operations in a single database transaction.
   * Rolls back the entire batch if sequence numbers collide or if validation fails.
   */
  async submitOperations(
    documentId: string,
    userId: string,
    clientId: string,
    operations: Array<{ version: number; change: string }>
  ) {
    try {
      const hasEditAccess = await canEdit(documentId, userId);
      if (!hasEditAccess) {
        throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to sync edits to this document');
      }

      // Limit maximum size of operations per sync request payload to safeguard bandwidth/processing
      if (operations.length > 100) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Payload contains too many operations. Max limit is 100 per sync request.');
      }

      // Reject if there are duplicates within the batch payload itself
      const versions = operations.map((op) => op.version);
      const hasDuplicates = new Set(versions).size !== versions.length;
      if (hasDuplicates) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'Malformed payload: duplicate version numbers detected in request.');
      }

      // Run transactional operations creation block
      const result = await prisma.$transaction(async (tx) => {
        const member = await tx.documentMember.findFirst({
          where: {
            documentId,
            userId,
            role: { in: [Role.OWNER, Role.EDITOR] }
          }
        });
        if (!member) {
          throw new AppError(ErrorCode.FORBIDDEN, 'You do not have permission to sync edits to this document');
        }

        for (const op of operations) {
          const changeBuffer = Buffer.from(op.change, 'hex');

          try {
            await tx.syncOperation.create({
              data: {
                documentId,
                clientId,
                version: op.version,
                operation: changeBuffer,
              },
            });
          } catch (error: any) {
            // Unique constraint failed on (documentId, version)
            if (error.code === 'P2002') {
              const aggregate = await tx.syncOperation.aggregate({
                where: { documentId },
                _max: {
                  version: true,
                },
              });
              const latestVersion = aggregate._max.version ?? 0;
              // Throw a specific error format to trigger an explicit transaction rollback
              throw new Error(`CONFLICT:${latestVersion}`);
            }
            throw error;
          }
        }
        return { success: true };
      });

      // Broadcast each operation after the database transaction commits successfully
      for (const op of operations) {
        broadcastUpdate(documentId, { clientId, version: op.version, change: op.change });
      }

      return result;
    } catch (error: any) {
      // Log irrecoverable batch sync failure to audit log
      auditRepository
        .logAction(userId, AuditAction.SYNC_FAILED, documentId, {
          clientId,
          operationCount: operations.length,
          error: error instanceof Error ? error.message : String(error),
        })
        .catch((auditErr) => console.error('[SyncService] Failed to write SYNC_FAILED audit log:', auditErr));

      throw error;
    }
  }

  /**
   * Merge all stored operations for a document into a single binary update.
   */
  async mergeDocumentUpdates(documentId: string, userId: string): Promise<Uint8Array> {
    const operations = await syncRepository.findOperations(documentId, userId, 0);
    const updates = operations.map((op) => op.operation);
    return mergeCRDTUpdates(updates);
  }

  /**
   * Persist a merged update snapshot of a document in DocumentVersion.
   * This is useful to consolidate change logs periodically.
   */
  async persistMergedState(documentId: string, userId: string) {
    const hasEditAccess = await canEdit(documentId, userId);
    if (!hasEditAccess) {
      throw new Error('Access denied: You do not have permission to persist snapshots');
    }

    const mergedState = await this.mergeDocumentUpdates(documentId, userId);
    return versionRepository.createVersion(documentId, userId, mergedState);
  }

  /**
   * Fetch the current version sequence of the document.
   */
  async getDocumentVersion(documentId: string, userId: string): Promise<number> {
    const hasReadAccess = await canRead(documentId, userId);
    if (!hasReadAccess) {
      throw new Error('Access denied');
    }
    return syncRepository.getLatestVersion(documentId, userId);
  }

  /**
   * Create a new document version snapshot.
   */
  async createSnapshot(documentId: string, userId: string, snapshotHex: string) {
    const hasEditAccess = await canEdit(documentId, userId);
    if (!hasEditAccess) {
      throw new Error('Access denied: You do not have permission to save snapshots');
    }

    const snapshotBuffer = Buffer.from(snapshotHex, 'hex');
    const version = await versionRepository.createVersion(documentId, userId, snapshotBuffer);

    // Write audit log
    await auditRepository.logAction(
      userId,
      AuditAction.SNAPSHOT_CREATED,
      documentId,
      { versionId: version.id }
    );

    return version;
  }

  /**
   * Get the latest snapshot of the document.
   */
  async getLatestSnapshot(documentId: string, userId: string) {
    const hasReadAccess = await canRead(documentId, userId);
    if (!hasReadAccess) {
      throw new Error('Access denied');
    }
    const version = await versionRepository.findLatestVersion(documentId, userId);
    if (!version) return null;
    return {
      id: version.id,
      snapshot: Buffer.from(version.snapshot).toString('hex'),
      createdBy: version.createdBy,
      createdAt: version.createdAt,
    };
  }

  /**
   * Retrieve all snapshots/versions of the document.
   */
  async getSnapshots(documentId: string, userId: string) {
    const hasReadAccess = await canRead(documentId, userId);
    if (!hasReadAccess) {
      throw new Error('Access denied');
    }
    const versions = await versionRepository.findVersions(documentId, userId);
    return versions.map((v) => ({
      id: v.id,
      snapshot: Buffer.from(v.snapshot).toString('hex'),
      createdBy: v.createdBy,
      createdAt: v.createdAt,
      creator: v.creator,
    }));
  }

  /**
   * Compare two snapshots of a document and return their text contents.
   * De-serializes snapshots into temporary Yjs Doc instances to extract strings.
   */
  async compareSnapshots(documentId: string, userId: string, versionAId: string, versionBId: string) {
    const hasReadAccess = await canRead(documentId, userId);
    if (!hasReadAccess) {
      throw new Error('Access denied: You do not have permission to access this document history');
    }

    const versionA = await prisma.documentVersion.findUnique({
      where: { id: versionAId },
    });
    const versionB = await prisma.documentVersion.findUnique({
      where: { id: versionBId },
    });

    if (!versionA || versionA.documentId !== documentId) {
      throw new Error(`Version A not found or does not belong to this document`);
    }
    if (!versionB || versionB.documentId !== documentId) {
      throw new Error(`Version B not found or does not belong to this document`);
    }

    const docA = new Y.Doc();
    Y.applyUpdate(docA, new Uint8Array(versionA.snapshot));

    const docB = new Y.Doc();
    Y.applyUpdate(docB, new Uint8Array(versionB.snapshot));

    const contentA = docA.getText('content').toString();
    const contentB = docB.getText('content').toString();

    return {
      contentA,
      contentB,
      areIdentical: contentA === contentB,
    };
  }

  /**
   * Restore a previous snapshot. Never overwrites historical operations; 
   * instead, calculates a revert delta update and appends it as a new operation version.
   */
  async restoreSnapshot(documentId: string, userId: string, versionId: string) {
    const hasEditAccess = await canEdit(documentId, userId);
    if (!hasEditAccess) {
      throw new Error('Access denied: You do not have permission to restore snapshots');
    }

    const targetVersion = await prisma.documentVersion.findUnique({
      where: { id: versionId },
    });
    if (!targetVersion || targetVersion.documentId !== documentId) {
      throw new Error('Target version snapshot not found or does not belong to this document');
    }

    // 1. Build current document state
    const docCurrent = new Y.Doc();
    const latestSnapshot = await versionRepository.findLatestVersion(documentId, userId);
    if (latestSnapshot) {
      Y.applyUpdate(docCurrent, new Uint8Array(latestSnapshot.snapshot));
    }
    const currentMerged = await this.mergeDocumentUpdates(documentId, userId);
    if (currentMerged.length > 0) {
      Y.applyUpdate(docCurrent, currentMerged);
    }

    // 2. Build target document state
    const docTarget = new Y.Doc();
    Y.applyUpdate(docTarget, new Uint8Array(targetVersion.snapshot));

    const textCurrent = docCurrent.getText('content');
    const textTarget = docTarget.getText('content');

    // 3. Compute the revert update by clearing current text and inserting target text.
    // Captures the update buffer generated on modification.
    let revertUpdate: Uint8Array = new Uint8Array();
    docCurrent.on('update', (update) => {
      revertUpdate = update;
    });

    docCurrent.transact(() => {
      if (textCurrent.length > 0) {
        textCurrent.delete(0, textCurrent.length);
      }
      textCurrent.insert(0, textTarget.toString());
    });

    if (revertUpdate.length === 0) {
      return {
        success: true,
        message: 'Document is already in the target version state',
      };
    }

    // 4. Save the revert update as a new SyncOperation version sequence
    const latestVersion = await syncRepository.getLatestVersion(documentId, userId);
    const nextVersion = latestVersion + 1;
    const changeHex = Buffer.from(revertUpdate).toString('hex');
    
    const result = await this.submitChange(
      documentId,
      userId,
      `system-restore-${userId}`,
      nextVersion,
      changeHex
    );

    if (result.success) {
      // Consolidate snapshot state immediately for clean future restore actions
      const persisted = await this.persistMergedState(documentId, userId);

      // Audit log
      await auditRepository.logAction(
        userId,
        AuditAction.RESTORE_PERFORMED,
        documentId,
        { targetVersionId: versionId, newVersion: nextVersion, newSnapshotId: persisted?.id }
      );

      return {
        success: true,
        version: result.version,
        change: changeHex,
      };
    }

    return result;
  }
}

export const syncService = new SyncService();
