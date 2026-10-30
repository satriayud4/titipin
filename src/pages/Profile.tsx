
import Credit from '../components/Credit'
import { useEffect, useState, type FormEvent } from 'react'
import {
  CircleAlert,
  CheckCircle2,
  UserRound,
  Mail,
  LockKeyhole,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import PasswordField from '../components/PasswordField'

export default function Profile() {
  const { session, profile, refreshProfile } = useAuth()

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [usernameBusy, setUsernameBusy] = useState(false)
  const [usernameError, setUsernameError] = useState('')
  const [usernameSuccess, setUsernameSuccess] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [nameBusy, setNameBusy] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)

  const [nameError, setNameError] = useState('')
  const [nameSuccess, setNameSuccess] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')

  useEffect(() => {
  setFullName(profile?.full_name ?? '')
  setUsername(profile?.username ?? '')
}, [profile?.full_name, profile?.username])

  async function handleNameSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setNameError('')
    setNameSuccess('')

    const normalizedName = fullName.trim()

    if (!normalizedName) {
      setNameError('Nama tampilan wajib diisi.')
      return
    }

    if (normalizedName.length > 100) {
      setNameError('Nama tampilan maksimal 100 karakter.')
      return
    }

    if (!session || !profile) {
      setNameError('Sesi akun tidak tersedia. Silakan masuk kembali.')
      return
    }

    if (normalizedName === profile.full_name) {
      setNameSuccess('Nama tampilan tidak berubah.')
      return
    }

    setNameBusy(true)

    try {
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update({ full_name: normalizedName })
        .eq('id', session.user.id)
        .select('id')

      if (updateError) throw updateError

      if (!data || data.length === 0) {
        throw new Error(
          'Nama belum tersimpan. Periksa izin akses profil.',
        )
      }

      await refreshProfile()
      setNameSuccess('Nama tampilan berhasil diperbarui.')
    } catch (err) {
      console.error('Gagal memperbarui nama:', err)
      setNameError(
        err instanceof Error
          ? err.message
          : 'Gagal memperbarui nama. Silakan coba lagi.',
      )
    } finally {
      setNameBusy(false)
    }
  }

  
async function handleUsernameSubmit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()
  setUsernameError('')
  setUsernameSuccess('')

  const normalizedUsername = username.trim().toLowerCase()

  if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
    setUsernameError(
      'Username harus 3–30 karakter, hanya huruf kecil, angka, dan underscore (_).',
    )
    return
  }

  if (!session || !profile) {
    setUsernameError('Sesi akun tidak tersedia. Silakan masuk kembali.')
    return
  }

  if (normalizedUsername === profile.username) {
    setUsernameSuccess('Username tidak berubah.')
    return
  }

  setUsernameBusy(true)

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ username: normalizedUsername })
      .eq('id', session.user.id)
      .select('id')

    if (error) {
      if (error.code === '23505') {
        throw new Error('Username sudah digunakan akun lain.')
      }

      if (error.code === '23514') {
        throw new Error('Format username tidak valid.')
      }

      throw error
    }

    if (!data || data.length === 0) {
      throw new Error(
        'Username belum tersimpan. Periksa izin akses profil.',
      )
    }

    await refreshProfile()
    setUsernameSuccess('Username berhasil diperbarui.')
  } catch (err) {
  console.error('Gagal memperbarui username:', err)
  setUsernameError(
    err instanceof Error
      ? err.message
      : JSON.stringify(err)
  )
} finally {
  setUsernameBusy(false)
}
}


  async function handleEmailSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEmailError('')
    setEmailMessage('')

    const normalizedEmail = newEmail.trim().toLowerCase()
    const currentEmail = session?.user.email?.toLowerCase() ?? ''

    if (!session) {
      setEmailError('Sesi akun tidak tersedia. Silakan masuk kembali.')
      return
    }

    if (!normalizedEmail) {
      setEmailError('Masukkan alamat email baru.')
      return
    }

    if (normalizedEmail.length > 254) {
      setEmailError('Alamat email terlalu panjang.')
      return
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError('Format alamat email belum valid.')
      return
    }

    if (normalizedEmail === currentEmail) {
      setEmailError('Email baru sama dengan email akun saat ini.')
      return
    }

    setEmailBusy(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        email: normalizedEmail,
      })

      if (updateError) throw updateError

      setNewEmail('')
      setEmailMessage(
        'Permintaan perubahan email berhasil diproses. Periksa email untuk menyelesaikan verifikasi. Email akun mungkin belum berubah sampai verifikasi selesai.',
      )
    } catch (err) {
      console.error('Gagal mengajukan perubahan email:', err)
      setEmailError(
        err instanceof Error
          ? err.message
          : 'Permintaan perubahan email gagal. Silakan coba lagi.',
      )
    } finally {
      setEmailBusy(false)
    }
  }

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPasswordError('')
    setPasswordMessage('')

    if (!session?.user.email) {
      setPasswordError(
        'Email akun tidak tersedia. Silakan masuk kembali.',
      )
      return
    }

    if (!currentPassword) {
      setPasswordError('Masukkan password saat ini.')
      return
    }

    if (newPassword.length < 5) {
      setPasswordError('Password baru minimal 5 karakter.')
      return
    }

    if (newPassword.length > 72) {
      setPasswordError('Password baru maksimal 72 karakter.')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi password baru tidak cocok.')
      return
    }

    if (newPassword === currentPassword) {
      setPasswordError(
        'Password baru harus berbeda dari password saat ini.',
      )
      return
    }

    setPasswordBusy(true)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      })

      if (authError) {
        setPasswordError(
          'Password saat ini salah atau verifikasi gagal. Periksa kembali.',
        )
        return
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (updateError) throw updateError

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordMessage('Password berhasil diperbarui.')
    } catch (err) {
      console.error('Gagal memperbarui password:', err)
      setPasswordError(
        err instanceof Error
          ? err.message
          : 'Gagal memperbarui password. Silakan coba lagi.',
      )
    } finally {
      setPasswordBusy(false)
    }
  }

  return (
    <div className="page-content profile-page">
      <div className="page-heading">
        <div>
          <h1>Profil Akun</h1>
          <p>Kelola informasi dan keamanan akun kamu.</p>
        </div>
      </div>

      
<section className="card">
  <div className="card-header">
    <UserRound size={22} />
    <div>
      <h2>Informasi pribadi</h2>
      <p>Kelola nama tampilan dan username akun kamu.</p>
    </div>
  </div>

  <form
    onSubmit={(e) => void handleNameSubmit(e)}
    className="form-stack"
    noValidate
  >
    <label className="field">
      <span>Nama tampilan</span>
      <input
        type="text"
        autoComplete="name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        maxLength={100}
        required
        disabled={nameBusy}
      />
    </label>

    {nameError && (
      <div className="notice notice-error" role="alert">
        <CircleAlert size={18} />
        <span>{nameError}</span>
      </div>
    )}

    {nameSuccess && (
      <div className="notice" role="status">
        <CheckCircle2 size={18} />
        <span>{nameSuccess}</span>
      </div>
    )}

    <button type="submit" disabled={nameBusy || !profile}>
      {nameBusy ? 'Menyimpan…' : 'Simpan nama'}
    </button>
  </form>

  <div className="form-stack" style={{ marginTop: 24 }}>
    <form
      id="username-form"
      onSubmit={(e) => void handleUsernameSubmit(e)}
      className="form-stack"
      noValidate
    >
      <label className="field">
        <span>Username</span>
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          minLength={3}
          maxLength={30}
          placeholder="contoh: yuda27"
          required
          disabled={usernameBusy}
        />
        <small>
          Digunakan untuk login. Gunakan 3–30 karakter berupa
          huruf kecil, angka, atau underscore (_).
        </small>
      </label>

      {usernameError && (
        <div className="notice notice-error" role="alert">
          <CircleAlert size={18} />
          <span>{usernameError}</span>
        </div>
      )}

      {usernameSuccess && (
        <div className="notice" role="status">
          <CheckCircle2 size={18} />
          <span>{usernameSuccess}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={usernameBusy || !profile}
      >
        {usernameBusy ? 'Menyimpan…' : 'Simpan username'}
      </button>
    </form>
  </div>

  <label className="field" style={{ marginTop: 24 }}>
    <span>Role akun</span>
    <input
      type="text"
      value={
        profile?.is_superadmin
          ? 'Superadmin'
          : profile?.role === 'admin'
            ? 'Admin'
            : 'Kasir'
      }
      readOnly
      disabled
    />
    <small>Role dan hak akses tidak dapat diubah dari sini.</small>
  </label>
</section>


      <section className="card">
        <div className="card-header">
          <Mail size={22} />
          <div>
            <h2>Alamat email</h2>
            <p>Ubah email login dengan verifikasi.</p>
          </div>
        </div>

        <form
          onSubmit={(e) => void handleEmailSubmit(e)}
          className="form-stack"
          noValidate
        >
          <label className="field">
            <span>Email saat ini</span>
            <input
              type="email"
              value={session?.user.email ?? ''}
              readOnly
              disabled
            />
          </label>

          <label className="field">
            <span>Email baru</span>
            <input
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              maxLength={254}
              placeholder="nama@email.com"
              required
              disabled={emailBusy}
            />
          </label>

          {emailError && (
            <div className="notice notice-error" role="alert">
              <CircleAlert size={18} />
              <span>{emailError}</span>
            </div>
          )}

          {emailMessage && (
            <div className="notice" role="status">
              <CheckCircle2 size={18} />
              <span>{emailMessage}</span>
            </div>
          )}

          <button type="submit" disabled={emailBusy || !session}>
            {emailBusy ? 'Memproses…' : 'Ubah email'}
          </button>
        </form>
      </section>

      <section className="card">
        <div className="card-header">
          <LockKeyhole size={22} />
          <div>
            <h2>Keamanan akun</h2>
            <p>Gunakan password baru yang tidak mudah ditebak.</p>
          </div>
        </div>

        <form
  onSubmit={(e) => void handlePasswordSubmit(e)}
  className="form-stack"
  noValidate
>
  <label className="field">
    <span>Password saat ini</span>
    <PasswordField
      value={currentPassword}
      onChange={setCurrentPassword}
      autoComplete="current-password"
    />
  </label>

  <label className="field">
    <span>Password baru</span>
    <PasswordField
      value={newPassword}
      onChange={setNewPassword}
      autoComplete="new-password"
    />
    <small>Minimal 5 karakter.</small>
  </label>

  <label className="field">
    <span>Konfirmasi password baru</span>
    <PasswordField
      value={confirmPassword}
      onChange={setConfirmPassword}
      autoComplete="new-password"
    />
  </label>

  {passwordError && (
    <div className="notice notice-error" role="alert">
      <CircleAlert size={18} />
      <span>{passwordError}</span>
    </div>
  )}

  {passwordMessage && (
    <div className="notice" role="status">
      <CheckCircle2 size={18} />
      <span>{passwordMessage}</span>
    </div>
  )}

  <button
    type="submit"
    disabled={passwordBusy || !session}
  >
    {passwordBusy ? 'Memproses…' : 'Ubah password'}
  </button>
</form>
      </section>
      <Credit />
    </div>
  )
}
