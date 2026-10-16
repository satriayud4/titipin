import { useCallback, useEffect, useState } from 'react'
import { Search, ShieldCheck, ShieldOff, Trash2, UserCheck, UserMinus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import { useConfirm, type ConfirmOptions } from '../components/ConfirmDialog'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import { errText } from '../lib/errors'

interface UserRow {
  id: string
  full_name: string
  email: string
  role: 'admin' | 'kasir'
  is_active: boolean
  is_superadmin: boolean
  created_at: string
  last_sign_in_at: string | null
}
type Filter = 'semua' | 'admin' | 'kasir' | 'berhenti'

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) : 'belum pernah masuk'

export default function Pengguna() {
  const notify = useToast()
  const confirm = useConfirm()
  const { session } = useAuth()
  const me = session?.user.id
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('semua')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_users')
    if (error) notify(errText(error), 'error')
    else setRows((data ?? []) as UserRow[])
    setLoading(false)
  }, [notify])

  useEffect(() => {
    void load()
  }, [load])

  async function act(u: UserRow, opts: ConfirmOptions, call: () => PromiseLike<{ error: unknown }>, success: string) {
    if (!(await confirm(opts))) return
    setBusy(u.id)
    const { error } = await call()
    setBusy(null)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify(success)
    await load()
  }

  const setRole = (u: UserRow, role: 'admin' | 'kasir') =>
    act(
      u,
      role === 'admin'
        ? {
            title: `Jadikan ${u.full_name} admin?`,
            message: 'Admin dapat mengubah atau menghapus data master, mengubah stok yang sudah terpakai, dan mengatur rekening serta QRIS.',
            confirmText: 'Ya, jadikan admin',
          }
        : {
            title: `Turunkan ${u.full_name} menjadi kasir?`,
            message: 'Akses admin akan dicabut. Riwayat tetap tersimpan.',
            confirmText: 'Ya, jadikan kasir',
          },
      () => supabase.rpc('set_user_role', { p_user: u.id, p_role: role }),
      role === 'admin' ? `${u.full_name} sekarang admin.` : `${u.full_name} sekarang kasir.`,
    )

  const toggleActive = (u: UserRow) =>
    u.is_active
      ? act(
          u,
          {
            title: `Berhentikan ${u.full_name}?`,
            message: 'Akun tidak bisa masuk lagi dan tidak bisa mencatat transaksi. Semua riwayat tetap tersimpan, dan akun bisa diaktifkan kembali kapan saja.',
            confirmText: 'Ya, berhentikan',
            tone: 'danger',
          },
          () => supabase.rpc('set_user_active', { p_user: u.id, p_active: false }),
          `${u.full_name} diberhentikan.`,
        )
      : act(
          u,
          { title: `Aktifkan kembali ${u.full_name}?`, message: 'Akun bisa masuk dan bekerja lagi.', confirmText: 'Ya, aktifkan' },
          () => supabase.rpc('set_user_active', { p_user: u.id, p_active: true }),
          `${u.full_name} diaktifkan kembali.`,
        )

  const remove = (u: UserRow) =>
    act(
      u,
      {
        title: `Hapus akun ${u.full_name}?`,
        message:
          'Akun dihapus permanen dan tidak bisa dikembalikan. Jika akun ini sudah punya riwayat transaksi atau pencatatan, penghapusan akan ditolak dan sebaiknya akun diberhentikan saja.',
        confirmText: 'Ya, hapus akun',
        tone: 'danger',
      },
      () => supabase.rpc('delete_user', { p_user: u.id }),
      'Akun berhasil dihapus.',
    )

  const counts = {
    semua: rows.length,
    admin: rows.filter((r) => r.role === 'admin').length,
    kasir: rows.filter((r) => r.role === 'kasir').length,
    berhenti: rows.filter((r) => !r.is_active).length,
  }
  const q = search.trim().toLowerCase()
  const shown = rows.filter((r) => {
    if (q && !`${r.full_name} ${r.email}`.toLowerCase().includes(q)) return false
    if (filter === 'admin') return r.role === 'admin'
    if (filter === 'kasir') return r.role === 'kasir'
    if (filter === 'berhenti') return !r.is_active
    return true
  })
  const pills: { key: Filter; label: string }[] = [
    { key: 'semua', label: 'Semua' },
    { key: 'admin', label: 'Admin' },
    { key: 'kasir', label: 'Kasir' },
    { key: 'berhenti', label: 'Diberhentikan' },
  ]

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="Pengguna" subtitle="Atur siapa yang bisa masuk dan apa perannya. Halaman ini hanya untuk superadmin." />

      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input placeholder="Cari nama atau email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="pills">
          {pills.map((p) => (
            <button key={p.key} type="button" className={`pill${filter === p.key ? ' on' : ''}`} onClick={() => setFilter(p.key)}>
              {p.label} ({counts[p.key]})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 88, borderRadius: 14 }} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState title="Tidak ada pengguna" text="Tidak ada akun yang cocok dengan pencarian atau filter ini." />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {shown.map((u) => (
            <div key={u.id} className={`urow${u.is_active ? '' : ' off'}`}>
              <span className="avatar">{u.full_name.trim().charAt(0).toUpperCase() || '?'}</span>
              <div className="urow-main">
                <div style={{ fontWeight: 700 }}>
                  {u.full_name || '(tanpa nama)'} {u.id === me && <span className="badge badge-muted">Anda</span>}
                </div>
                <div className="page-sub" style={{ overflowWrap: 'anywhere' }}>
                  {u.email} · terakhir masuk {when(u.last_sign_in_at)}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  <span className={`badge ${u.is_superadmin ? 'badge-purple' : u.role === 'admin' ? 'badge-info' : 'badge-muted'}`}>
                    {u.is_superadmin ? 'Superadmin' : u.role === 'admin' ? 'Admin' : 'Kasir'}
                  </span>
                  <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>
                    {u.is_active ? 'Aktif' : 'Diberhentikan'}
                  </span>
                </div>
              </div>

              {!u.is_superadmin && u.id !== me && (
                <div className="urow-actions">
                  {u.role === 'kasir' ? (
                    <button className="btn-sm btn-icon" disabled={busy === u.id} onClick={() => void setRole(u, 'admin')}>
                      <ShieldCheck size={15} /> Jadikan admin
                    </button>
                  ) : (
                    <button className="btn-sm btn-icon" disabled={busy === u.id} onClick={() => void setRole(u, 'kasir')}>
                      <ShieldOff size={15} /> Jadikan kasir
                    </button>
                  )}
                  <button className="btn-sm btn-icon" disabled={busy === u.id} onClick={() => void toggleActive(u)}>
                    {u.is_active ? <><UserMinus size={15} /> Berhentikan</> : <><UserCheck size={15} /> Aktifkan</>}
                  </button>
                  <button className="btn-sm btn-icon btn-danger" disabled={busy === u.id} onClick={() => void remove(u)}>
                    <Trash2 size={15} /> Hapus
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}