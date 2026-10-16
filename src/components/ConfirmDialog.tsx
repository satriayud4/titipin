import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import Modal from './Modal'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  tone?: 'primary' | 'danger'
}
type Ask = (o: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Ask>(() => Promise.resolve(false))

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)

  const ask = useCallback<Ask>((opts) => new Promise<boolean>((resolve) => setState({ opts, resolve })), [])

  function answer(v: boolean) {
    state?.resolve(v)
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {state && (
        <Modal
          size="sm"
          title={state.opts.title}
          onClose={() => answer(false)}
          footer={
            <>
              <button type="button" onClick={() => answer(false)}>{state.opts.cancelText ?? 'Batal'}</button>
              <button
                type="button"
                autoFocus
                className={state.opts.tone === 'danger' ? 'btn-danger-solid' : 'btn-primary'}
                onClick={() => answer(true)}
              >
                {state.opts.confirmText ?? 'Ya, lanjutkan'}
              </button>
            </>
          }
        >
          {state.opts.message && <p style={{ margin: 0, color: 'var(--muted)' }}>{state.opts.message}</p>}
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  return useContext(ConfirmContext)
}