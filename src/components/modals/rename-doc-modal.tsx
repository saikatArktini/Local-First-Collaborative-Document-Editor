"use client"

import { useActionState, useEffect, useRef } from "react"
import { renameDocumentAction } from "@/app/actions/documents"

interface RenameDocModalProps {
  documentId: string
  currentTitle: string
  onClose: () => void
}

/**
 * RenameDocModal component
 * Renders a modal form to change a document's title.
 */
export default function RenameDocModal({ documentId, currentTitle, onClose }: RenameDocModalProps) {
  const [state, action, pending] = useActionState(renameDocumentAction, undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  // Initialize input value and select text for quick editing
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.value = currentTitle
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [currentTitle])

  // Close modal on successful rename
  useEffect(() => {
    if (state?.success) {
      onClose()
    }
  }, [state, onClose])

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h2 className="modal-title">Rename Document</h2>
        <p className="modal-subtitle">Enter a new title for this document.</p>

        <form action={action}>
          <input type="hidden" name="documentId" value={documentId} />
          {state?.error && <div className="error-msg">{state.error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="rename-title">New Title</label>
            <input
              ref={inputRef}
              id="rename-title"
              name="title"
              type="text"
              className="form-input"
              defaultValue={currentTitle}
              maxLength={100}
              required
            />
          </div>

          <div className="btn-row">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? <><span className="spinner" /> Saving…</> : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
