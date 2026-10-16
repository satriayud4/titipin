import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, type Role } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import BrandMark from './BrandMark'

interface Props {
  roles?: Role[]
  superOnly?: boolean
  children: ReactNode
}

export default function ProtectedRoute({ roles, superOnly, children }: Props) {
  const { session, profile, loading, signOut } = useAuth()
  const store = useStore()

  if (loading) {
    return (
      <div className="splash">
        <BrandMark />
        <div className="page-sub">Memuat {store.name}…</div>
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  if (!profile || !profile.is_active) {
    return (
      <div className="splash">
        <h2>Akun tidak aktif</h2>
        <p className="page-sub" style={{ margin: 0 }}>Hubungi pemilik toko untuk mengaktifkan akun Anda.</p>
        <button onClick={() => void signOut()}>Keluar</button>
      </div>
    )
  }
  if (superOnly && !profile.is_superadmin) return <Navigate to="/" replace />
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />
  return <>{children}</>
}