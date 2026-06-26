import { documentRepository } from '@/server/repositories/document.repository';
import { Role } from '@prisma/client';

/**
 * Returns the access role of a user on a specific document, or null if no access is granted.
 */
export async function getDocumentRole(documentId: string, userId: string): Promise<Role | null> {
  const membership = await documentRepository.findMember(documentId, userId);
  return membership ? membership.role : null;
}

/**
 * Checks if a user has READ access (OWNER, EDITOR, or VIEWER) to a document.
 */
export async function canRead(documentId: string, userId: string): Promise<boolean> {
  const role = await getDocumentRole(documentId, userId);
  return role !== null;
}

/**
 * Checks if a user has EDIT access (OWNER or EDITOR) to a document.
 */
export async function canEdit(documentId: string, userId: string): Promise<boolean> {
  const role = await getDocumentRole(documentId, userId);
  return role === Role.OWNER || role === Role.EDITOR;
}

/**
 * Checks if a user has DELETE or INVITE access (OWNER only) to a document.
 */
export async function canDelete(documentId: string, userId: string): Promise<boolean> {
  const role = await getDocumentRole(documentId, userId);
  return role === Role.OWNER;
}

/**
 * Checks if a user has SYNC access (OWNER, EDITOR, or VIEWER) to a document.
 */
export async function canSync(documentId: string, userId: string): Promise<boolean> {
  const role = await getDocumentRole(documentId, userId);
  return role === Role.OWNER || role === Role.EDITOR || role === Role.VIEWER;
}
