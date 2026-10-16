import { Store } from 'lucide-react'
import { useStore } from '../store/StoreContext'

export default function BrandMark({ size = 22 }: { size?: number }) {
  const { logoUrl, name } = useStore()
  return (
    <span className={`brand-logo${logoUrl ? ' has-img' : ''}`}>
      {logoUrl ? <img src={logoUrl} alt={name} /> : <Store size={size} />}
    </span>
  )
}