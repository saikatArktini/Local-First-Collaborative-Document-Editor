import { auth } from "@/auth"
import { redirect, notFound } from "next/navigation"
import { documentRepository } from "@/server/repositories/document.repository"
import { getDocumentRole } from "@/server/permissions/document.permissions"
import EditorClient from "./editor"
import type { Metadata } from "next"

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const doc = await documentRepository.findById(id, "").catch(() => null)
  return {
    title: doc ? `${doc.title} — CollabEdit` : "Document — CollabEdit",
  }
}

export default async function DocumentPage({ params }: PageProps) {
  const { id: documentId } = await params
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login")
  }

  const userId = session.user.id

  // Verify access
  const role = await getDocumentRole(documentId, userId)
  if (!role) {
    notFound()
  }

  // Fetch document with members
  const doc = await documentRepository.findById(documentId, userId, true)
  if (!doc) {
    notFound()
  }

  // Extract members with user info (attached by Prisma `include`)
  const rawDoc = doc as any
  const members = (rawDoc.members ?? []).map((m: any) => ({
    id: m.id,
    documentId: m.documentId,
    userId: m.userId,
    role: m.role,
    user: m.user ?? null,
  }))

  return (
    <EditorClient
      documentId={documentId}
      initialTitle={doc.title}
      currentUserId={userId}
      currentUserRole={role}
      members={members}
    />
  )
}
