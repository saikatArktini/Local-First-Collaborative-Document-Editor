"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { deleteDocumentAction } from "@/app/actions/documents"
import CreateDocModal from "./modals/create-doc-modal"
import RenameDocModal from "./modals/rename-doc-modal"

export interface DocItem {
  id: string
  title: string
  role: "OWNER" | "EDITOR" | "VIEWER"
  createdAt: string
  updatedAt: string
}

interface DashboardClientProps {
  documents: DocItem[]
  userName: string
  userEmail: string
}

/**
 * DashboardClient component
 * Client-side entry point for the dashboard workspace listing the user's documents.
 * Supports document creation, renaming, deletion, and navigation to document editors.
 */
export default function DashboardClient({ documents, userName, userEmail }: DashboardClientProps) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [renameDoc, setRenameDoc] = useState<DocItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpenDoc(id: string) {
    router.push(`/document/${id}`)
  }

  /**
   * Triggers server-side deletion of a document. Requires Owner privileges.
   */
  async function handleDelete(e: React.MouseEvent, doc: DocItem) {
    e.stopPropagation()
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return
    setDeletingId(doc.id)
    startTransition(async () => {
      const result = await deleteDocumentAction(doc.id)
      if (result?.error) alert(result.error)
      setDeletingId(null)
    })
  }

  function handleRename(e: React.MouseEvent, doc: DocItem) {
    e.stopPropagation()
    setRenameDoc(doc)
  }

  // Helper to assign styled badges to different collaborator roles
  function roleBadgeClass(role: string) {
    const base = "inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-bold uppercase tracking-wider"
    if (role === "OWNER") return `${base} bg-accent-secondary/10 text-indigo-400`
    if (role === "VIEWER") return `${base} bg-white/5 text-[#71717a]`
    return `${base} bg-accent-primary/10 text-purple-400`
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[1.1rem] font-bold text-text-primary">All Documents</h2>
        <button
          id="new-document-btn"
          className="inline-flex items-center gap-2 px-[1.1rem] py-[0.6rem] bg-accent-gradient border-none rounded-md text-white text-sm font-semibold cursor-pointer transition-all duration-150 hover:opacity-[0.88] hover:-translate-y-[1px] hover:shadow-glow"
          onClick={() => setShowCreate(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Document
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-5">
        {documents.length > 0 ? (
          documents.map((doc) => {
            const isOwner = doc.role === "OWNER"
            const isDeleting = deletingId === doc.id

            return (
              <div
                key={doc.id}
                id={`doc-card-${doc.id}`}
                className="bg-bg-surface border border-border-subtle rounded-lg p-6 flex flex-col gap-3.5 cursor-pointer transition-all duration-250 hover:border-accent-primary/40 hover:-translate-y-[3px] hover:shadow-lg relative overflow-hidden group hover:after:content-[''] hover:after:absolute hover:after:inset-0 hover:after:bg-accent-gradient hover:after:opacity-[0.03] hover:after:transition-opacity"
                onClick={() => handleOpenDoc(doc.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && handleOpenDoc(doc.id)}
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-md bg-accent-glow border border-accent-primary/20 flex items-center justify-center text-accent-primary shrink-0">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-text-primary m-0 leading-snug pt-[0.15rem] break-all">{doc.title}</h3>
                </div>

                <div className="flex justify-between items-center text-[0.78rem] text-text-muted">
                  <span className={roleBadgeClass(doc.role)}>{doc.role}</span>
                  <span className="text-[0.75rem] text-text-muted">
                    {new Date(doc.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>

                {isOwner && (
                  <div className="flex gap-2 border-t border-border-subtle pt-3.5 mt-0.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.75rem] font-semibold rounded border border-border-default bg-bg-hover text-text-secondary cursor-pointer transition-all duration-150 hover:bg-bg-active hover:text-text-primary hover:border-border-strong"
                      onClick={(e) => handleRename(e, doc)}
                      title="Rename document"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Rename
                    </button>
                    <button
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[0.75rem] font-semibold rounded border border-border-default bg-bg-hover text-text-secondary cursor-pointer transition-all duration-150 hover:bg-bg-active hover:text-text-primary hover:border-border-strong hover:bg-danger-bg hover:border-danger-border hover:text-danger-text"
                      onClick={(e) => handleDelete(e, doc)}
                      disabled={isDeleting}
                      title="Delete document"
                    >
                      {isDeleting ? (
                        <span className="spinner w-3 h-3" />
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      )}
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <div className="col-span-full flex flex-col items-center justify-center py-20 px-8 bg-bg-hover border border-dashed border-border-default rounded-xl text-text-secondary text-sm text-center">
            <div className="mb-3">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <p>No documents yet.</p>
            <button className="btn btn-primary mt-4" onClick={() => setShowCreate(true)}>
              Create your first document
            </button>
          </div>
        )}
      </div>

      {showCreate && <CreateDocModal onClose={() => setShowCreate(false)} />}
      {renameDoc && (
        <RenameDocModal
          documentId={renameDoc.id}
          currentTitle={renameDoc.title}
          onClose={() => setRenameDoc(null)}
        />
      )}
    </>
  )
}
