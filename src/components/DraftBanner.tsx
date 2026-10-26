import { History, Trash2 } from 'lucide-react'
import { timeAgo } from '../lib/drafts'
import './ui.css'

export default function DraftBanner({ at, onDiscard }: { at: number; onDiscard: () => void }) {
  return (
    <div className="draft-banner no-print" role="status">
      <History size={18} />
      <span>Draft dipulihkan ({timeAgo(at)}). Perubahanmu tersimpan otomatis.</span>
      <button type="button" className="btn-sm" onClick={onDiscard}>
        <Trash2 size={14} /> Buang draft
      </button>
    </div>
  )
}
