import prisma from '@/lib/prisma';
import { Document, DocumentMember, Role, Prisma } from '@prisma/client';

export class DocumentRepository {
  /**
   * Find a document by ID, optionally including members.
   */
  async findById(id: string, userId: string, includeMembers = false): Promise<Document | null> {
    return prisma.document.findFirst({
      where: {
        id,
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: includeMembers
          ? {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            }
          : false,
      },
    });
  }

  /**
   * List all documents a user has access to, including their roles.
   */
  async findUserDocuments(userId: string) {
    return prisma.documentMember.findMany({
      where: { userId },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  /**
   * Create a new document and assign the creator as the OWNER (both in field and membership).
   */
  async createDocument(title: string, ownerId: string, baseState?: Uint8Array): Promise<Document> {
    return prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          title,
          ownerId,
        },
      });

      // Create document owner membership
      await tx.documentMember.create({
        data: {
          documentId: document.id,
          userId: ownerId,
          role: Role.OWNER,
        },
      });

      // If initial state is provided, save it as the first version snapshot
      if (baseState) {
        await tx.documentVersion.create({
          data: {
            documentId: document.id,
            snapshot: new Uint8Array(baseState),
            createdBy: ownerId,
          },
        });
      }

      return document;
    });
  }

  /**
   * Add a member to an existing document.
   */
  async addMember(documentId: string, callerId: string, userId: string, role: Role = Role.EDITOR): Promise<DocumentMember> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, ownerId: callerId }
    });
    if (!doc) throw new Error('Access denied: Only the document owner can manage members');
    return prisma.documentMember.create({
      data: {
        documentId,
        userId,
        role,
      },
    });
  }

  /**
   * Remove a member from a document.
   */
  async removeMember(documentId: string, callerId: string, userId: string): Promise<DocumentMember> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, ownerId: callerId }
    });
    if (!doc) throw new Error('Access denied: Only the document owner can manage members');
    return prisma.documentMember.delete({
      where: {
        userId_documentId: {
          userId,
          documentId,
        },
      },
    });
  }

  /**
   * Update the role of an existing member.
   */
  async updateMemberRole(documentId: string, callerId: string, userId: string, role: Role): Promise<DocumentMember> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, ownerId: callerId }
    });
    if (!doc) throw new Error('Access denied: Only the document owner can manage members');
    return prisma.documentMember.update({
      where: {
        userId_documentId: {
          userId,
          documentId,
        },
      },
      data: { role },
    });
  }

  /**
   * Find a specific member entry by user and document ID.
   */
  async findMember(documentId: string, userId: string): Promise<DocumentMember | null> {
    return prisma.documentMember.findUnique({
      where: {
        userId_documentId: {
          userId,
          documentId,
        },
      },
    });
  }

  /**
   * Update the document details (e.g. title).
   */
  async updateDocument(id: string, userId: string, data: Prisma.DocumentUpdateInput): Promise<Document> {
    const member = await prisma.documentMember.findFirst({
      where: {
        documentId: id,
        userId,
        role: { in: [Role.OWNER, Role.EDITOR] }
      }
    });
    if (!member) {
      throw new Error('Access denied: You do not have permission to edit this document');
    }
    return prisma.document.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a document (cascades memberships, sync operations, versions, and logs).
   */
  async deleteDocument(id: string, userId: string): Promise<Document> {
    const doc = await prisma.document.findFirst({
      where: { id, ownerId: userId }
    });
    if (!doc) {
      throw new Error('Access denied: Only the document owner can delete this document');
    }
    return prisma.document.delete({
      where: { id },
    });
  }
}

export const documentRepository = new DocumentRepository();
