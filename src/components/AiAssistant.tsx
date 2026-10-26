import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CalendarRange, CalendarCheck, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { supabase } from '../lib/supabase'
import { AI_OPEN_EVENT, askAssistant, askBrief, clearAllAiStorage, loadChat, saveChat, topicLabel, type ChatMsg } from '../lib/ai'
import './AiAssistant.css'

const SUGGESTIONS: { title: string; items: string[] }[] = [
  {
    title: 'Analisis penjualan',
    items: [
      'Produk apa yang paling laris dan paling lambat terjual 7 hari terakhir?',
      'Hari dan jam berapa penjualan paling tinggi (30 hari terakhir)?',
      'Bandingkan omzet hari ini dengan kemarin.',
      'Produk mana yang penjualannya menurun dibanding minggu lalu?',
      'Apa faktor yang mungkin membuat laba turun?',
    ],
  },
  {
    title: 'Konsinyasi & barang tidak laku',
    items: [
      'Produk mana yang retur-nya paling tinggi 30 hari terakhir?',
      'Bandingkan performa setiap supplier 30 hari terakhir.',
      'Berapa persen barang titipan yang terjual dan tidak terjual?',
      'Sarankan penyesuaian jumlah titipan untuk tiap produk.',
      'Produk mana yang sering menyisakan stok?',
    ],
  },
]

let seq = 0
const newId = () => `${Date.now().toString(36)}-${seq++}`

/** Penampil Markdown sederhana (tebal dan daftar) tanpa innerHTML, jadi aman dari injeksi HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  )
}
function RichText({ text }: { text: string }) {
  const out: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) {
      const items = list
      out.push(
        <ul key={`u${out.length}`}>
          {items.map((t, i) => (
            <li key={i}>{inline(t)}</li>
          ))}
        </ul>,
      )
      list = []
    }
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const m = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (m) list.push(m[1])
    else {
      flush()
      if (line) out.push(<p key={`p${out.length}`}>{inline(line.replace(/^#+\s*/, ''))}</p>)
    }
  }
  flush()
  return <>{out}</>
}

export default function AiAssistant() {
  const { session, profile } = useAuth()
  const store = useStore()
  const uid = session?.user.id ?? ''
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<ChatMsg[]>(() => (uid ? loadChat(uid) : []))
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const msgsRef = useRef(msgs)
  const busyRef = useRef(false)

  useEffect(() => {
    msgsRef.current = msgs
    if (uid) saveChat(uid, msgs)
  }, [msgs, uid])

  // keluar akun: hapus semua riwayat chat sementara
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((ev) => {
      if (ev === 'SIGNED_OUT') {
        clearAllAiStorage()
        setMsgs([])
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs, busy, open])

  const run = useCallback(
    async (kind: 'chat' | 'harian' | 'mingguan', question?: string) => {
      if (busyRef.current) return
      const label = kind === 'harian' ? 'Buat ringkasan harian' : kind === 'mingguan' ? 'Buat ringkasan mingguan' : (question ?? '').trim()
      if (!label) return
      const userMsg: ChatMsg = { id: newId(), role: 'user', content: label.slice(0, 500) }
      const next = [...msgsRef.current, userMsg]
      msgsRef.current = next
      setMsgs(next)
      setText('')
      busyRef.current = true
      setBusy(true)
      try {
        const r = kind === 'chat' ? await askAssistant(next, store.name) : await askBrief(kind, store.name)
        setMsgs((c) => [...c, { id: newId(), role: 'assistant', content: r.reply, used: r.used }])
      } catch (e) {
        setMsgs((c) => [...c, { id: newId(), role: 'assistant', content: (e as Error).message, error: true }])
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [store.name],
  )

  // dibuka dari tempat lain (header, dashboard), boleh langsung membawa pertanyaan
  useEffect(() => {
    const onOpen = (e: Event) => {
      const ask = (e as CustomEvent<{ ask?: string }>).detail?.ask
      setOpen(true)
      if (ask) void run('chat', ask)
    }
    window.addEventListener(AI_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(AI_OPEN_EVENT, onOpen)
  }, [run])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!profile) return null

  const reset = () => {
    setMsgs([])
    msgsRef.current = []
  }
  const submit = () => void run('chat', text)

  return (
    <>
      <button type="button" className="icon-btn ai-trigger" onClick={() => setOpen(true)} aria-label="Buka asisten AI" title="Asisten AI">
        <Sparkles size={19} />
      </button>

      {open &&
        createPortal(
          <div className="ai-scrim" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <aside className="ai-panel" role="dialog" aria-modal="true" aria-label="Asisten AI">
              <header className="ai-head">
                <span className="ai-badge"><Sparkles size={18} /></span>
                <div className="ai-title">
                  <strong>Asisten {store.name}</strong>
                  <small>Menjawab dari data toko Anda</small>
                </div>
                {msgs.length > 0 && (
                  <button type="button" className="icon-btn" onClick={reset} aria-label="Mulai percakapan baru" title="Percakapan baru" disabled={busy}>
                    <RotateCcw size={17} />
                  </button>
                )}
                <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Tutup">
                  <X size={20} />
                </button>
              </header>

              <div className="ai-body">
                {msgs.length === 0 && (
                  <div className="ai-intro">
                    <p>Halo{profile.full_name ? `, ${profile.full_name.trim().split(' ')[0]}` : ''}! Tanyakan apa saja soal penjualan, stok, retur, supplier, dan setoran. Angka saya ambil langsung dari database toko.</p>
                    <div className="ai-brief">
                      <button type="button" className="btn btn-sm" onClick={() => void run('harian')} disabled={busy}>
                        <CalendarCheck size={15} /> Ringkasan harian
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => void run('mingguan')} disabled={busy}>
                        <CalendarRange size={15} /> Ringkasan mingguan
                      </button>
                    </div>
                    {SUGGESTIONS.map((g) => (
                      <div key={g.title} className="ai-group">
                        <div className="ai-group-title">{g.title}</div>
                        {g.items.map((q) => (
                          <button key={q} type="button" className="ai-suggest" onClick={() => void run('chat', q)} disabled={busy}>
                            {q}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {msgs.map((m) => (
                  <div key={m.id} className={`ai-msg ${m.role}${m.error ? ' err' : ''}`}>
                    {m.role === 'assistant' ? <RichText text={m.content} /> : m.content}
                    {m.used && m.used.length > 0 && (
                      <div className="ai-used">Data dipakai: {m.used.map(topicLabel).join(', ')}</div>
                    )}
                  </div>
                ))}

                {busy && (
                  <div className="ai-msg assistant ai-typing" aria-live="polite" aria-label="Asisten sedang menyiapkan jawaban">
                    <i /><i /><i />
                  </div>
                )}
                <div ref={endRef} />
              </div>

              <footer className="ai-foot">
                <div className="ai-inputrow">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={text}
                    maxLength={500}
                    placeholder="Tanya soal toko…"
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault()
                        submit()
                      }
                    }}
                  />
                  <button type="button" className="btn btn-primary ai-send" onClick={submit} disabled={busy || !text.trim()} aria-label="Kirim">
                    <Send size={17} />
                  </button>
                </div>
                <div className="ai-note">Laba adalah estimasi. Riwayat chat hilang saat tab ditutup atau keluar akun.</div>
              </footer>
            </aside>
          </div>,
          document.body,
        )}
    </>
  )
}
