import { Store } from 'lucide-react'
import { useStore } from '../store/StoreContext'

// fixed = selalu ikon bawaan (untuk halaman sebelum login)
export default function BrandMark({ size = 22, fixed = false }: { size?: number; fixed?: boolean }) {
  const { logoUrl, name } = useStore()
  const url = fixed ? null : logoUrl
  return (
    <span className={`brand-logo${url ? ' has-img' : ''}`}>
      {url ? <img src={url} alt={name} /> : <Store size={size} />}
    </span>
  )
}