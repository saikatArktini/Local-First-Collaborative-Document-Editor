"use client"

import { useActionState, useEffect, useRef } from "react"
import { createDocumentAction } from "@/app/actions/documents"
import { useRouter } from "next/navigation"

interface CreateDocModalProps {
  onClose: () => void
}

/**
 * CreateDocModal component
 * Renders a modal form to create a new collaborative document.
 */
export default function CreateDocModal({ onClose }: CreateDocModalProps) {
  const router = useRouter()
  const [state, action, pending] = useActionState(createDocumentAction, undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus input on load
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Redirect to new document page on successful creation
  useEffect(() => {
    if (state?.success && state.documentId) {
      onClose()
      router.push(`/document/${state.documentId}`)
    }
  }, [state, router, onClose])

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h2 className="modal-title">New Document</h2>
        <p className="modal-subtitle">Give your document a title to get started.</p>

        <form action={action}>
          {state?.error && <div className="error-msg">{state.error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="create-title">Document Title</label>
            <input
              ref={inputRef}
              id="create-title"
              name="title"
              type="text"
              className="form-input"
              placeholder="e.g. Project Roadmap"
              maxLength={100}
              required
            />
          </div>

          <div className="btn-row">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? <><span className="spinner" /> Creating…</> : "Create Document"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
