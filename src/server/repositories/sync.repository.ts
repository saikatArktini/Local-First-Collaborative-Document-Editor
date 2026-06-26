import prisma from '@/lib/prisma';
import { SyncOperation, Role } from '@prisma/client';

export class SyncRepository {
  /**
   * Find sync operations for a document that occurred after a specific version, scoped to membership.
   */
  async findOperations(documentId: string, userId: string, sinceVersion: number): Promise<SyncOperation[]> {
    return prisma.syncOperation.findMany({
      where: {
        documentId,
        document: {
          members: {
            some: {
              userId,
            },
          },
        },
        version: {
          gt: sinceVersion,
        },
      },
      orderBy: {
        version: 'asc',
      },
    });
  }

  /**
   * Create a new sync operation (append to change log), verifying write privileges.
   */
  async createOperation(documentId: string, userId: string, clientId: string, version: number, operation: Uint8Array): Promise<SyncOperation> {
    const member = await prisma.documentMember.findFirst({
      where: {
        documentId,
        userId,
        role: { in: [Role.OWNER, Role.EDITOR] }
      }
    });
    if (!member) {
      throw new Error('Access denied: You do not have permission to write operations to this document');
    }
    return prisma.syncOperation.create({
      data: {
        documentId,
        clientId,
        version,
        operation: new Uint8Array(operation),
      },
    });
  }

  /**
   * Get the latest version number for a document, scoped to membership.
   * Returns 0 if there are no sync operations yet.
   */
  async getLatestVersion(documentId: string, userId: string): Promise<number> {
    const aggregate = await prisma.syncOperation.aggregate({
      where: {
        documentId,
        document: {
          members: {
            some: {
              userId,
            },
          },
        },
      },
      _max: {
        version: true,
      },
    });
    return aggregate._max.version ?? 0;
  }

  /**
   * Delete sync operations history for a document, restricted to owner.
   */
  async deleteOperations(documentId: string, userId: string): Promise<void> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, ownerId: userId }
    });
    if (!doc) {
      throw new Error('Access denied: Only the document owner can manage operations history');
    }
    await prisma.syncOperation.deleteMany({
      where: { documentId },
    });
  }
}

export const syncRepository = new SyncRepository();
