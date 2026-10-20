
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { CircleAlert, MailCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import AuthShell from '../components/AuthShell'
import PasswordField from '../components/PasswordField'

function registerError(msg: string) {
  const lower = msg.toLowerCase()

  if (lower.includes('database error')) {
    return 'Kode pendaftaran tidak valid atau pendaftaran gagal. Periksa kode dan coba lagi.'
  }

  if (lower.includes('already registered')) {
    return 'Email ini sudah terdaftar. Silakan masuk atau gunakan fitur lupa password.'
  }

  if (
    lower.includes('password should be') ||
    lower.includes('password is too short')
  ) {
    return 'Kata sandi tidak memenuhi ketentuan minimum.'
  }

  if (lower.includes('signup is disabled')) {
    return 'Pendaftaran sedang dinonaktifkan. Hubungi pemilik toko.'
  }

  return 'Pendaftaran gagal. Periksa data dan koneksi, lalu coba lagi.'
}

export default function Register() {
  const { session } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (
      !fullName.trim() ||
      !email.trim() ||
      !password ||
      !code.trim()
    ) {
      setError('Semua kolom wajib diisi.')
      return
    }

    if (password.length < 6) {
      setError('Kata sandi minimal 6 karakter.')
      return
    }

    setBusy(true)

    try {
      const { data, error: signUpError } =
        await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              signup_code: code.trim(),
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })

        console.log('Signup diagnostic:', {
        sessionReturned: Boolean(data.session),
        confirmedAt: data.user?.confirmed_at,
        confirmationSentAt: data.user?.confirmation_sent_at,
        identitiesCount: data.user?.identities?.length,
      })

      if (signUpError) {
        setError(registerError(signUpError.message))
        return
      }

      if (data.session) {
        // Mendukung konfigurasi yang langsung memberikan sesi.
        // Akses aplikasi tetap dilindungi ProtectedRoute.
        return
      }

      setSubmittedEmail(email.trim())
    } catch {
      setError('Terjadi gangguan koneksi. Silakan coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  if (submittedEmail) {
    return (
      <AuthShell
        title="Periksa email kamu"
        subtitle="Satu langkah lagi sebelum kamu bisa masuk ke Titipin."
        footer={
          <>
            Sudah memverifikasi email? <Link to="/login">Masuk</Link>
          </>
        }
      >
        <div className="notice" role="status">
          <MailCheck size={20} />
          <span>
            Jika pendaftaran berhasil, tautan verifikasi telah
            dikirim ke <strong>{submittedEmail}</strong>.
            Buka email tersebut dan ikuti tautannya untuk
            menyelesaikan verifikasi.
          </span>
        </div>

        <p className="page-sub">
          Jika email tidak ditemukan, periksa folder spam
          atau pastikan alamat email yang dimasukkan benar.
          Kamu juga dapat mencoba masuk untuk melihat status akun.
        </p>

        <Link className="button" to="/login">
          Kembali ke halaman masuk
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Daftar akun kasir"
      subtitle="Minta kode pendaftaran kepada pemilik toko."
      footer={
        <>
          Sudah punya akun? <Link to="/login">Masuk</Link>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(e) => void handleSubmit(e)}
        className="form-stack"
      >
        <label className="field">
          <span>
            Nama lengkap <span className="req">*</span>
          </span>
          <input
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={100}
          />
        </label>

        <label className="field">
          <span>
            Email <span className="req">*</span>
          </span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
          />
        </label>

        <label className="field">
          <span>
            Kata sandi <span className="req">*</span>
          </span>
          <PasswordField
            value={password}
            onChange={setPassword}
            placeholder="Minimal 6 karakter"
            autoComplete="new-password"
          />
        </label>

        <label className="field">
          <span>
            Kode pendaftaran <span className="req">*</span>
          </span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            maxLength={100}
          />
        </label>

        {error && (
          <div className="notice notice-error" role="alert">
            <CircleAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        <button disabled={busy}>
          {busy ? 'Memproses…' : 'Daftar'}
        </button>
      </form>
    </AuthShell>
  )
}
