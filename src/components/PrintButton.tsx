import { Printer } from 'lucide-react'
import { printPage } from '../lib/print'

export default function PrintButton({ mode = 'page', label = 'Cetak', className = '' }: { mode?: 'page' | 'receipt'; label?: string; className?: string }) {
  return (
    <button type="button" className={`btn-icon no-print ${className}`} onClick={() => printPage(mode)}>
      <Printer size={16} /> {label}
    </button>
  )
}
