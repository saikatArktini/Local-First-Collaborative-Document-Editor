import prisma from '@/lib/prisma';
import { DocumentVersion, Role } from '@prisma/client';

export class VersionRepository {
  /**
   * Save a new document version snapshot, verifying write privileges.
   */
  async createVersion(documentId: string, createdBy: string, snapshot: Uint8Array): Promise<DocumentVersion> {
    const member = await prisma.documentMember.findFirst({
      where: {
        documentId,
        userId: createdBy,
        role: { in: [Role.OWNER, Role.EDITOR] }
      }
    });
    if (!member) {
      throw new Error('Access denied: You do not have permission to create version snapshots on this document');
    }
    return prisma.documentVersion.create({
      data: {
        documentId,
        createdBy,
        snapshot: new Uint8Array(snapshot),
      },
    });
  }

  /**
   * Find the latest version snapshot for a document, scoped to membership.
   */
  async findLatestVersion(documentId: string, userId: string): Promise<DocumentVersion | null> {
    return prisma.documentVersion.findFirst({
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Retrieve the complete version snapshot history for a document, scoped to membership.
   */
  async findVersions(documentId: string, userId: string) {
    return prisma.documentVersion.findMany({
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
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }
}

export const versionRepository = new VersionRepository();
