import { useEffect, useRef, type ReactNode, type RefObject } from 'react'

interface DialogProps {
  open: boolean
  onClose: () => void
  labelledBy: string
  variant: 'drawer' | 'modal'
  /** Elemen yang menerima fokus saat dialog dibuka (misalnya judul dengan tabIndex -1). */
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}

/**
 * Dialog modal berbasis `<dialog>` native: fokus terkunci di dalam dialog, Escape menutup,
 * klik latar menutup, dan fokus dikembalikan ke pemicu setelah ditutup.
 */
export function Dialog({ open, onClose, labelledBy, variant, initialFocusRef, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const pointerDownOnBackdrop = useRef(false)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
      initialFocusRef?.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, initialFocusRef])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => {
      const target = returnFocusRef.current
      returnFocusRef.current = null
      if (target?.isConnected) target.focus()
      // Sinkronkan state jika browser menutup dialog sendiri (misalnya Escape berulang).
      onCloseRef.current()
    }
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [])

  return (
    <dialog
      ref={dialogRef}
      className={`dialog dialog--${variant}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onPointerDown={(event) => {
        pointerDownOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pointerDownOnBackdrop.current) onClose()
        pointerDownOnBackdrop.current = false
      }}
    >
      {open ? <div className="dialog__panel">{children}</div> : null}
    </dialog>
  )
}
