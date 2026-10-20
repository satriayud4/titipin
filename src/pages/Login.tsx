
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { CircleAlert, MailCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import AuthShell from '../components/AuthShell'
import PasswordField from '../components/PasswordField'

export default function Login() {
  const { session } = useAuth()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [unverified, setUnverified] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resending, setResending] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setUnverified(false)

    const value = identifier.trim()

    if (!value || !password) {
      setError('Email/username dan kata sandi wajib diisi.')
      return
    }

    setBusy(true)

    try {
      if (value.includes('@')) {
        // Login email tetap memakai alur lama.
        const { error: loginError } =
          await supabase.auth.signInWithPassword({
            email: value,
            password,
          })

        if (loginError) {
          const message = loginError.message.toLowerCase()

          if (message.includes('email not confirmed')) {
            setError(
              'Email kamu belum diverifikasi. Periksa kotak masuk atau kirim ulang email verifikasi.',
            )
            setUnverified(true)
          } else if (message.includes('banned')) {
            setError('Akun ini telah diberhentikan. Hubungi pemilik toko.')
          } else {
            setError('Email/username atau kata sandi salah.')
          }
        }
      } else {
        // Login username melalui Edge Function.
        const { data, error: functionError } =
          await supabase.functions.invoke('login-username', {
            body: {
              identifier: value.toLowerCase(),
              password,
            },
          })

        if (functionError || !data?.session) {
          setError(
            data?.error || 'Email/username atau kata sandi salah.',
          )
          return
        }

        const { error: sessionError } =
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          })

        if (sessionError) {
          setError('Gagal membuat sesi login. Silakan coba lagi.')
        }
      }
    } catch {
      setError('Terjadi gangguan koneksi. Silakan coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  async function resendVerification() {
    setError('')
    setInfo('')

    const value = identifier.trim()

    if (!value || !value.includes('@')) {
      setError('Masukkan email yang digunakan saat mendaftar.')
      return
    }

    setResending(true)

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: value,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (resendError) {
        setError(
          'Email verifikasi belum dapat dikirim ulang. Coba beberapa saat lagi.',
        )
      } else {
        setInfo(
          'Permintaan pengiriman ulang berhasil diproses. Periksa email dan folder spam.',
        )
      }
    } catch {
      setError('Terjadi gangguan koneksi. Silakan coba lagi.')
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthShell
      title="Selamat datang kembali"
      subtitle="Masuk untuk mulai berjualan dan mengelola toko."
      footer={
        <>
          Belum punya akun? <Link to="/register">Daftar</Link>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(e) => void handleSubmit(e)}
        className="form-stack"
      >
        <label className="field">
          <span>Email atau username</span>
          <input
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            maxLength={254}
          />
        </label>

        <label className="field">
          <span>Kata sandi</span>
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </label>

        <div>
          <Link to="/forgot-password" className="link">
            Lupa kata sandi?
          </Link>
        </div>

        {error && (
          <div className="notice notice-error" role="alert">
            <CircleAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        {info && (
          <div className="notice" role="status">
            <MailCheck size={18} />
            <span>{info}</span>
          </div>
        )}

        {unverified && (
          <button
            type="button"
            className="button-secondary"
            disabled={resending}
            onClick={() => void resendVerification()}
          >
            {resending ? 'Mengirim…' : 'Kirim ulang email verifikasi'}
          </button>
        )}

        <button disabled={busy}>
          {busy ? 'Memproses…' : 'Masuk'}
        </button>
      </form>
    </AuthShell>
  )
}
