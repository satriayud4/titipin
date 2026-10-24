import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'

type Kind = 'success' | 'error'
interface ToastItem {
  id: number
  message: string
  kind: Kind
}

const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const notify = useCallback((message: string, kind: Kind = 'success') => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev, { id, message, kind }])
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 4000)
  }, [])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role="status">
            {t.kind === 'success' ? <CircleCheck size={20} /> : <CircleAlert size={20} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}