import prisma from '@/lib/prisma';
import { AuditLog, AuditAction, Prisma } from '@prisma/client';

export class AuditRepository {
  /**
   * Log a structured action performed by a user.
   * @param userId    - The user who performed the action
   * @param action    - The AuditAction enum value
   * @param documentId - The document this action relates to (optional)
   * @param metadata  - Structured context (e.g. role change details, version IDs)
   */
  async logAction(
    userId: string,
    action: AuditAction,
    documentId?: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog> {
    return prisma.auditLog.create({
      data: {
        userId,
        action,
        documentId: documentId ?? null,
        metadata: metadata ? (metadata as Prisma.JsonObject) : undefined,
      },
    });
  }

  /**
   * Retrieve all audit logs for a specific document, ordered newest-first.
   * Only returns logs if the given userId is a member of the document.
   */
  async findLogsByDocument(documentId: string, userId: string): Promise<AuditLog[]> {
    // Verify the caller is a member of the document before returning logs
    const membership = await prisma.documentMember.findFirst({
      where: { documentId, userId },
    });
    if (!membership) {
      throw new Error('Access denied: You do not have permission to view this document\'s audit log');
    }

    return prisma.auditLog.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  /**
   * Retrieve all audit logs for a specific user, ordered newest-first.
   */
  async findLogsByUser(userId: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const auditRepository = new AuditRepository();
