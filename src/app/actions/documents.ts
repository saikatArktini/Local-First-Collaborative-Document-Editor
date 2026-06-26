"use server"

import { auth } from "@/auth"
import { documentService } from "@/server/services/document.service"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function createDocumentAction(prevState: any, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not authenticated." }

  const title = (formData.get("title") as string)?.trim()
  if (!title) return { error: "Title is required." }
  if (title.length > 100) return { error: "Title must be 100 characters or less." }

  try {
    const doc = await documentService.createDocument(title, session.user.id)
    revalidatePath("/")
    return { success: true, documentId: doc.id }
  } catch (e: any) {
    return { error: e.message || "Failed to create document." }
  }
}

export async function renameDocumentAction(prevState: any, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not authenticated." }

  const documentId = formData.get("documentId") as string
  const title = (formData.get("title") as string)?.trim()

  if (!documentId) return { error: "Missing document ID." }
  if (!title) return { error: "Title is required." }
  if (title.length > 100) return { error: "Title must be 100 characters or less." }

  try {
    await documentService.renameDocument(documentId, title, session.user.id)
    revalidatePath("/")
    return { success: true }
  } catch (e: any) {
    return { error: e.message || "Failed to rename document." }
  }
}

export async function deleteDocumentAction(documentId: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Not authenticated." }

  try {
    await documentService.deleteDocument(documentId, session.user.id)
    revalidatePath("/")
    return { success: true }
  } catch (e: any) {
    return { error: e.message || "Failed to delete document." }
  }
}
