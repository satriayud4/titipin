
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CircleAlert,
  LockKeyhole,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import AuthShell from '../components/AuthShell'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 5) {
      setError('Password baru minimal 5 karakter.')
      return
    }

    if (password !== confirmPassword) {
      setError('Konfirmasi password belum cocok.')
      return
    }

    setBusy(true)

    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession()

      if (sessionError || !sessionData.session) {
        setError(
          'Sesi reset tidak ditemukan atau sudah kedaluwarsa. Silakan minta tautan reset baru.',
        )
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) {
        setError(updateError.message)
        return
      }

      setSuccess(true)
    } catch {
      setError('Terjadi gangguan koneksi. Silakan coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={success ? 'Password berhasil diubah' : 'Atur password baru'}
      subtitle={
        success
          ? 'Password akun Titipin kamu sudah diperbarui.'
          : 'Buat password baru untuk kembali masuk ke akun Titipin.'
      }
      footer={
        <>
          Ingat password? <Link to="/login">Kembali ke halaman masuk</Link>
        </>
      }
    >
      {success ? (
        <div className="form-stack">
          <div className="notice" role="status">
            <CheckCircle2 size={20} />
            <span>
              Password berhasil diperbarui. Silakan masuk menggunakan password
              baru.
            </span>
          </div>
          <button type="button" onClick={() => navigate('/login')}>
            Masuk sekarang
          </button>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={(e) => void handleSubmit(e)}
          className="form-stack"
        >
          <label className="field">
            <span>
              Password baru <span className="req">*</span>
            </span>
            <div className="password-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={5}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={
                  showPassword ? 'Sembunyikan password' : 'Lihat password'
                }
                aria-pressed={showPassword}
                tabIndex={0}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </label>

          <label className="field">
            <span>
              Konfirmasi password baru <span className="req">*</span>
            </span>
            <div className="password-input-wrap">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={5}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={
                  showConfirmPassword
                    ? 'Sembunyikan konfirmasi password'
                    : 'Lihat konfirmasi password'
                }
                aria-pressed={showConfirmPassword}
                tabIndex={0}
              >
                {showConfirmPassword ? (
                  <EyeOff size={19} />
                ) : (
                  <Eye size={19} />
                )}
              </button>
            </div>
          </label>

          {error && (
            <div className="notice notice-error" role="alert">
              <CircleAlert size={18} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={busy}>
            {busy ? 'Menyimpan…' : 'Simpan password baru'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
