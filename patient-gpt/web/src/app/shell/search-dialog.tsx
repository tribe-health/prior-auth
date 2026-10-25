// TJ-ARCH-MOB-001 compliant
// The search dialog's frame (shell.css `dialog.search`). Vector search over
// case content is not part of the scaffold contract, so the dialog says so.
import { useEffect, useRef } from 'react'
import { Icon } from '../../shared/icons/icon'

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog className="search" id="search" aria-label="Search embedded case content" ref={ref} onClose={onClose}>
      <div className="search-head">
        <div className="search-field on-field od-row">
          <span className="od-fixed">
            <Icon name="search" />
          </span>
          <label className="sr-only" htmlFor="search-input">
            Search embedded content across every case
          </label>
          <input className="od-fill" id="search-input" type="search" placeholder="Search every case by meaning" autoComplete="off" />
          <button className="icon-btn od-fixed" id="search-close" type="button" aria-label="Close search" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
      </div>
      <p className="search-status" id="search-status" role="status">
        Search is not connected in this build.
      </p>
      <ul className="search-results" id="search-results" />
    </dialog>
  )
}
