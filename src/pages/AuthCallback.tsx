
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import AuthShell from '../components/AuthShell'
import BootScreen from '../components/BootScreen'

export default function AuthCallback() {
  const { session, loading } = useAuth()

  if (loading) return <BootScreen />

  if (session) return <Navigate to="/" replace />

  return (
    <AuthShell
      title="Verifikasi email"
      subtitle="Jika kamu baru saja memverifikasi email, coba masuk menggunakan akunmu."
      footer={
        <>
          Sudah memverifikasi email? <Link to="/login">Masuk</Link>
        </>
      }
    >
      <div className="notice" role="status">
        <span>
          Sesi belum tersedia. Tautan mungkin sudah kedaluwarsa,
          tidak valid, atau proses verifikasi belum selesai.
          Kamu bisa mencoba membuka tautan dari email terbaru.
        </span>
      </div>
    </AuthShell>
  )
}
