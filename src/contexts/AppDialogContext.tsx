import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, X } from 'lucide-react'

type DialogKind = 'info' | 'warning' | 'danger'
type DialogRequest = {
  title: string
  message: string
  kind: DialogKind
  confirmLabel: string
  cancelLabel?: string
  resolve: (confirmed: boolean) => void
}

let enqueueDialog: ((request: DialogRequest) => void) | null = null

function requestDialog(request: Omit<DialogRequest, 'resolve'>) {
  return new Promise<boolean>((resolve) => {
    if (!enqueueDialog) return resolve(false)
    enqueueDialog({ ...request, resolve })
  })
}

export async function showAppAlert(message: string, title = '알려드려요', kind: DialogKind = 'info') {
  await requestDialog({ title, message, kind, confirmLabel: '확인' })
}

export function showAppConfirm(message: string, options?: { title?: string; confirmLabel?: string; cancelLabel?: string; kind?: DialogKind }) {
  return requestDialog({
    title: options?.title || '확인해 주세요',
    message,
    kind: options?.kind || 'warning',
    confirmLabel: options?.confirmLabel || '확인',
    cancelLabel: options?.cancelLabel || '취소',
  })
}

const DialogContext = createContext(false)

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<DialogRequest | null>(null)
  const queue = useRef<DialogRequest[]>([])

  useEffect(() => {
    enqueueDialog = (request) => setCurrent((active) => {
      if (active) { queue.current.push(request); return active }
      return request
    })
    return () => { enqueueDialog = null }
  }, [])

  const close = (confirmed: boolean) => {
    if (!current) return
    current.resolve(confirmed)
    setCurrent(queue.current.shift() || null)
  }
  const Icon = current?.kind === 'danger' ? AlertTriangle : current?.kind === 'warning' ? HelpCircle : CheckCircle2

  return <DialogContext.Provider value>{children}{current && <div className="app-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && current.cancelLabel && close(false)}><section className={`app-dialog ${current.kind}`} role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message"><button className="app-dialog-close" aria-label="닫기" onClick={() => close(false)}><X /></button><div className="app-dialog-icon"><Icon /></div><h2 id="app-dialog-title">{current.title}</h2><p id="app-dialog-message">{current.message}</p><div className="app-dialog-actions">{current.cancelLabel && <button onClick={() => close(false)}>{current.cancelLabel}</button>}<button className="confirm" autoFocus onClick={() => close(true)}>{current.confirmLabel}</button></div></section></div>}</DialogContext.Provider>
}

export function useAppDialogReady() {
  return useContext(DialogContext)
}
