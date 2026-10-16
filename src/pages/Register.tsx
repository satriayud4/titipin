import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { CircleAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import AuthShell from '../components/AuthShell'
import PasswordField from '../components/PasswordField'

function registerError(msg: string) {
  if (msg.includes('Database error')) return 'Kode pendaftaran salah.'
  if (msg.toLowerCase().includes('already registered')) return 'Email ini sudah terdaftar. Silakan masuk.'
  if (msg.toLowerCase().includes('password should be')) return 'Kata sandi terlalu pendek (minimal 6 karakter).'
  return msg
}

export default function Register() {
  const { session } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!fullName.trim() || !email.trim() || !password || !code.trim()) {
      setError('Semua kolom wajib diisi.')
      return
    }
    if (password.length < 6) {
      setError('Kata sandi minimal 6 karakter.')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), signup_code: code.trim() } },
    })
    if (error) setError(registerError(error.message))
    setBusy(false)
  }

  return (
    <AuthShell
      title="Daftar akun kasir"
      subtitle="Minta kode pendaftaran kepada pemilik toko."
      footer={<>Sudah punya akun? <Link to="/login">Masuk</Link></>}
    >
      <form noValidate onSubmit={(e) => void handleSubmit(e)} className="form-stack">
        <label className="field">
          <span>Nama lengkap <span className="req">*</span></span>
          <input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="field">
          <span>Email <span className="req">*</span></span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Kata sandi <span className="req">*</span></span>
          <PasswordField value={password} onChange={setPassword} placeholder="Minimal 6 karakter" autoComplete="new-password" />
        </label>
        <label className="field">
          <span>Kode pendaftaran <span className="req">*</span></span>
          <input value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {error && (
          <div className="notice notice-error" role="alert">
            <CircleAlert size={18} />
            <span>{error}</span>
          </div>
        )}
        <button disabled={busy}>{busy ? 'Memproses…' : 'Daftar'}</button>
      </form>
    </AuthShell>
  )
}