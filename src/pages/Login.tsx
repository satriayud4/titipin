import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { CircleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import AuthShell from '../components/AuthShell'
import PasswordField from '../components/PasswordField'

export default function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Email dan kata sandi wajib diisi.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) {
      setError(
        error.message.toLowerCase().includes('banned')
          ? 'Akun ini telah diberhentikan. Hubungi pemilik toko.'
          : 'Email atau kata sandi salah.',
      )
    }
    setBusy(false)
  }

  return (
    <AuthShell
      title="Selamat datang kembali"
      subtitle="Masuk untuk mulai berjualan dan mengelola toko."
      footer={<>Belum punya akun? <Link to="/register">Daftar</Link></>}
    >
      <form noValidate onSubmit={(e) => void handleSubmit(e)} className="form-stack">
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Kata sandi</span>
          <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
        </label>
        {error && (
          <div className="notice notice-error" role="alert">
            <CircleAlert size={18} />
            <span>{error}</span>
          </div>
        )}
        <button disabled={busy}>{busy ? 'Memproses…' : 'Masuk'}</button>
      </form>
    </AuthShell>
  )
}