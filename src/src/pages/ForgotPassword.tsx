
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, MailCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import AuthShell from '../components/AuthShell'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    const normalizedEmail = email.trim()

    if (!normalizedEmail) {
      setError('Masukkan alamat email terlebih dahulu.')
      return
    }

    setBusy(true)

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          {
            redirectTo: `${window.location.origin}/reset-password`,
          },
        )

      if (resetError) {
  console.error('Reset password error:', resetError)
  setError(resetError.message)
  return
}

      setSubmitted(true)
    } catch {
      setError('Terjadi gangguan koneksi. Silakan coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={submitted ? 'Periksa email kamu' : 'Lupa password?'}
      subtitle={
        submitted
          ? 'Jika email terdaftar, tautan untuk mengatur ulang password akan dikirim.'
          : 'Masukkan email akun Titipin untuk menerima tautan reset password.'
      }
      footer={
        <>
          Ingat password? <Link to="/login">Kembali ke halaman masuk</Link>
        </>
      }
    >
      {submitted ? (
        <>
          <div className="notice" role="status">
            <MailCheck size={20} />
            <span>
              Jika alamat tersebut terdaftar, email berisi tautan
              reset password akan dikirim ke{' '}
              <strong>{email.trim()}</strong>. Periksa juga folder spam.
            </span>
          </div>

          <button
            type="button"
            className="button"
            onClick={() => {
              setSubmitted(false)
              setError('')
            }}
          >
            Coba email lain
          </button>
        </>
      ) : (
        <form
          noValidate
          onSubmit={(e) => void handleSubmit(e)}
          className="form-stack"
        >
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
              required
            />
          </label>

          {error && (
            <div className="notice notice-error" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
            </div>
          )}

          <button disabled={busy}>
            {busy ? 'Mengirim…' : 'Kirim tautan reset'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
