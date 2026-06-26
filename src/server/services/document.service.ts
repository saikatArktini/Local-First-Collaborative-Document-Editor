import { documentRepository } from '@/server/repositories/document.repository';
import { userRepository } from '@/server/repositories/user.repository';
import { auditRepository } from '@/server/repositories/audit.repository';
import {
  canRead,
  canEdit,
  canDelete,
  getDocumentRole,
} from '@/server/permissions/document.permissions';
import { Role, Document, AuditAction } from '@prisma/client';

export class DocumentService {
  /**
   * Retrieve all documents accessible to the given user.
   */
  async listUserDocuments(userId: string) {
    const list = await documentRepository.findUserDocuments(userId);
    return list.map((item) => ({
      id: item.document.id,
      title: item.document.title,
      role: item.role,
      createdAt: item.document.createdAt,
      updatedAt: item.document.updatedAt,
    }));
  }

  /**
   * Retrieve a specific document, checking that the user has permission to view it.
   */
  async getDocument(documentId: string, userId: string): Promise<Document & { role: Role }> {
    const hasAccess = await canRead(documentId, userId);
    if (!hasAccess) {
      throw new Error('Access denied: You do not have permission to view this document');
    }

    const doc = await documentRepository.findById(documentId, userId);
    if (!doc) {
      throw new Error('Document not found');
    }

    const role = (await getDocumentRole(documentId, userId))!;
    return {
      ...doc,
      role,
    };
  }

  /**
   * Create a new document.
   */
  async createDocument(title: string, userId: string, initialContent?: string): Promise<Document> {
    const baseState = initialContent ? Buffer.from(initialContent) : undefined;
    const document = await documentRepository.createDocument(title, userId, baseState);

    // Audit log
    await auditRepository.logAction(
      userId,
      AuditAction.DOCUMENT_CREATED,
      document.id,
      { title }
    );

    return document;
  }

  /**
   * Update the document details (e.g. title).
   */
  async renameDocument(documentId: string, title: string, userId: string): Promise<Document> {
    const hasEditAccess = await canEdit(documentId, userId);
    if (!hasEditAccess) {
      throw new Error('Access denied: You do not have permission to edit this document');
    }

    const document = await documentRepository.updateDocument(documentId, userId, { title });

    // Audit log
    await auditRepository.logAction(
      userId,
      AuditAction.ROLE_CHANGED,
      documentId,
      { title, action: 'renamed' }
    );

    return document;
  }

  /**
   * Delete a document. Only the owner can delete the document.
   */
  async deleteDocument(documentId: string, userId: string): Promise<Document> {
    const isOwner = await canDelete(documentId, userId);
    if (!isOwner) {
      throw new Error('Access denied: Only the document owner can delete this document');
    }

    const document = await documentRepository.deleteDocument(documentId, userId);

    // Audit log
    await auditRepository.logAction(
      userId,
      AuditAction.DOCUMENT_DELETED,
      documentId,
      { title: document.title }
    );

    return document;
  }

  /**
   * Add a member to a document by email. Only the owner can add members.
   */
  async addMember(documentId: string, ownerId: string, memberEmail: string, role: Role = Role.EDITOR) {
    const isOwner = await canDelete(documentId, ownerId);
    if (!isOwner) {
      throw new Error('Access denied: Only the document owner can manage members');
    }

    const newMember = await userRepository.findByEmail(memberEmail);
    if (!newMember) {
      throw new Error(`User with email "${memberEmail}" not found`);
    }

    // Check if they are already a member
    const existing = await documentRepository.findMember(documentId, newMember.id);
    if (existing) {
      throw new Error('User is already a member of this document');
    }

    const membership = await documentRepository.addMember(documentId, ownerId, newMember.id, role);

    // Audit log
    await auditRepository.logAction(
      ownerId,
      AuditAction.ROLE_CHANGED,
      documentId,
      { memberId: newMember.id, memberEmail, role, action: 'added' }
    );

    return membership;
  }

  /**
   * Remove a member from a document. Only the owner can remove members.
   */
  async removeMember(documentId: string, ownerId: string, memberId: string) {
    const isOwner = await canDelete(documentId, ownerId);
    if (!isOwner) {
      throw new Error('Access denied: Only the document owner can manage members');
    }

    // Cannot remove oneself
    if (memberId === ownerId) {
      throw new Error('You cannot remove yourself from your own document');
    }

    const membership = await documentRepository.removeMember(documentId, ownerId, memberId);

    // Audit log
    await auditRepository.logAction(
      ownerId,
      AuditAction.ROLE_CHANGED,
      documentId,
      { memberId, action: 'removed' }
    );

    return membership;
  }

  /**
   * Update member permissions. Only the owner can change roles.
   */
  async updateMemberRole(documentId: string, ownerId: string, memberId: string, role: Role) {
    const isOwner = await canDelete(documentId, ownerId);
    if (!isOwner) {
      throw new Error('Access denied: Only the document owner can manage members');
    }

    // Cannot change one's own role (must remain OWNER)
    if (memberId === ownerId) {
      throw new Error('You cannot modify your own role');
    }

    const membership = await documentRepository.updateMemberRole(documentId, ownerId, memberId, role);

    // Audit log
    await auditRepository.logAction(
      ownerId,
      AuditAction.ROLE_CHANGED,
      documentId,
      { memberId, newRole: role }
    );

    return membership;
  }
}

export const documentService = new DocumentService();
