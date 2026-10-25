import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { Banknote, CalendarClock, Check, ChevronDown, Hourglass, Info, Percent, Search, Sparkles, TriangleAlert, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/ConfirmDialog'
import PageHeader from '../components/PageHeader'
import EmptyState from '../components/EmptyState'
import DatePicker from '../components/DatePicker'
import TimePicker from '../components/TimePicker'
import { errText } from '../lib/errors'
import { rupiah } from '../lib/format'
import { addDays, todayWIB } from '../lib/dates'
import { imageUrl } from '../lib/image'
import { ALERTS_REFRESH_EVENT } from '../lib/alerts'
import {
  PROMO_V2_SQL_FILE,
  SHARE_OPTIONS,
  discountLabel,
  fromLegacy,
  isMissingSetup,
  promoCost,
  promoPrice,
  shareLabel,
  shortDate,
  windowLabel,
  wibIso,
  wibStamp,
  wibTime,
  type DiscountType,
  type PromoCampaign,
} from '../lib/promo'
import './Promo.css'

interface BatchRow {
  batch_id: number
  supplier_id: number
  product_id: number
  qty_remaining: number
  cost_price: number
  sell_price: number
  received_date: string
  sellable_until: string
}

const EXP_WINDOWS = [
  { days: 0, label: 'Hari ini' },
  { days: 1, label: 'Besok' },
  { days: 3, label: '3 hari' },
  { days: 7, label: '7 hari' },
]
const QUICK: Record<DiscountType, number[]> = {
  percent: [10, 20, 30, 40, 50],
  nominal: [1000, 2000, 3000, 5000, 10000],
}
const TIME_PRESETS = ['09:00', '12:00', '15:00', '18:00', '21:00']

function expiredLabel(date: string, today: string) {
  if (date === today) return 'Expired hari ini'
  if (date === addDays(today, 1)) return 'Expired besok'
  return `Expired ${shortDate(date)}`
}

function totals(c: PromoCampaign) {
  let sold = 0
  let revenue = 0
  let discount = 0
  let supplier = 0
  let left = 0
  let start = 0
  for (const i of c.items) {
    sold += i.qty_sold
    revenue += i.qty_sold * i.promo_price
    discount += i.qty_sold * (i.original_price - i.promo_price)
    supplier += i.qty_sold * (i.original_cost - i.promo_cost)
    start += i.qty_at_start ?? 0
    if (i.active) left += i.qty_remaining
  }
  return { sold, revenue, discount, supplier, store: discount - supplier, left, start }
}

/** Jam WIB sekarang sebagai HH:MM. */
function nowHM() {
  return wibTime(new Date().toISOString()).replace('.', ':')
}
function defaultTimes() {
  const h = Number(nowHM().slice(0, 2))
  const s = Math.min(h + 1, 23)
  const e = Math.min(s + 3, 23)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { start: `${pad(s)}:00`, end: e === s ? '23:55' : `${pad(e)}:00` }
}

function Seg<T extends string | number>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (v: T) => void
  label: string
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className="pm-seg" role="radiogroup" aria-label={label} style={{ '--n': options.length, '--i': idx } as CSSProperties}>
      <span className="pm-seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Step({ n, title, sub, children }: { n: number; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="pm-step" style={{ '--d': n } as CSSProperties}>
      <header>
        <span className="pm-num">{n}</span>
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
      </header>
      <div className="pm-body">{children}</div>
    </section>
  )
}

export default function Promo() {
  const notify = useToast()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || !!profile?.is_superadmin
  const today = todayWIB()

  const [batches, setBatches] = useState<BatchRow[]>([])
  const [products, setProducts] = useState<Map<number, { name: string; image_path: string | null }>>(new Map())
  const [suppliers, setSuppliers] = useState<Map<number, string>>(new Map())
  const [campaigns, setCampaigns] = useState<PromoCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  // ---- form
  const [scope, setScope] = useState<'expiring' | 'all'>('expiring')
  const [expDays, setExpDays] = useState(3)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [type, setType] = useState<DiscountType>('percent')
  const [value, setValue] = useState('30')
  const [timeMode, setTimeMode] = useState<'expired' | 'window'>('expired')
  const [startNow, setStartNow] = useState(true)
  const dt = useMemo(defaultTimes, [])
  const [startDate, setStartDate] = useState(today)
  const [startTime, setStartTime] = useState(dt.start)
  const [endDate, setEndDate] = useState(today)
  const [endTime, setEndTime] = useState(dt.end)
  const [share, setShare] = useState(0)
  const [name, setName] = useState(`Promo ${shortDate(today)}`)
  const [note, setNote] = useState('')

  const load = useCallback(
    async (silent = false) => {
      const t = todayWIB()
      // jadwal promo disinkronkan dulu supaya yang tampil sudah yang terbaru
      await supabase.rpc('promo_sync')
      const PAGE = 1000
      const rows: BatchRow[] = []
      let batchError: unknown = null
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('batch_stock')
          .select('batch_id, supplier_id, product_id, qty_remaining, cost_price, sell_price, received_date, sellable_until')
          .gt('qty_remaining', 0)
          .gte('sellable_until', t)
          .order('sellable_until')
          .order('batch_id')
          .range(from, from + PAGE - 1)
        if (error) {
          batchError = error
          break
        }
        rows.push(...((data ?? []) as BatchRow[]))
        if (!data || data.length < PAGE) break
      }
      const [p, s, c, legacy] = await Promise.all([
        supabase.from('products').select('id, name, image_path'),
        supabase.from('suppliers').select('id, name'),
        supabase.rpc('promo_rule_list'),
        supabase.rpc('promo_list'), // promo versi lama (riwayat), boleh gagal
      ])
      if (c.error) {
        if (isMissingSetup(c.error)) setSetupNeeded(true)
        else if (!silent) notify(errText(c.error), 'error')
        setLoading(false)
        return
      }
      if (batchError && !silent) notify(errText(batchError), 'error')
      setSetupNeeded(false)
      setBatches(rows)
      setProducts(new Map((p.data ?? []).map((x) => [x.id as number, { name: x.name as string, image_path: (x.image_path as string | null) ?? null }])))
      setSuppliers(new Map((s.data ?? []).map((x) => [x.id as number, x.name as string])))
      const news = ((c.data ?? []) as PromoCampaign[]).map((x) => ({ ...x, legacy: false }))
      const olds = legacy.error ? [] : ((legacy.data ?? []) as PromoCampaign[]).map((x) => fromLegacy(x))
      setCampaigns([...news, ...olds])
      setLoading(false)
    },
    [notify],
  )

  useEffect(() => {
    void load()
  }, [load])

  // jadwal jam: segarkan otomatis tiap 30 detik selama halaman terbuka
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 30000)
    return () => window.clearInterval(id)
  }, [load])

  // stok yang sudah ikut promo (berjalan atau terjadwal) tidak ditawarkan lagi
  const onPromo = useMemo(() => {
    const s = new Set<number>()
    for (const c of campaigns) {
      if (c.status === 'selesai') continue
      for (const i of c.items) if (c.status === 'terjadwal' || i.active) s.add(i.batch_id)
    }
    return s
  }, [campaigns])

  const limit = addDays(today, expDays)
  const q = search.trim().toLowerCase()
  const candidates = useMemo(
    () =>
      batches.filter((b) => {
        if (onPromo.has(b.batch_id)) return false
        if (scope === 'expiring' && b.sellable_until > limit) return false
        if (q === '') return true
        return (products.get(b.product_id)?.name ?? '').toLowerCase().includes(q) || (suppliers.get(b.supplier_id) ?? '').toLowerCase().includes(q)
      }),
    [batches, onPromo, scope, limit, q, products, suppliers],
  )
  const shown = candidates.slice(0, 150)
  const pickedRows = batches.filter((b) => picked.has(b.batch_id) && !onPromo.has(b.batch_id))

  const num = Number(value)
  const valueOk = value.trim() !== '' && Number.isInteger(num) && (type === 'percent' ? num >= 1 && num <= 90 : num >= 1)
  const preview = valueOk
    ? pickedRows.map((b) => {
        const pp = promoPrice(b.sell_price, type, num)
        const pc = promoCost(b.cost_price, b.sell_price, pp, share)
        return { b, pp, pc, margin: pp - pc }
      })
    : []
  const losing = preview.filter((r) => r.margin < 0).length
  const free = preview.filter((r) => r.pp === 0).length

  // ---- validasi waktu
  const nowMs = Date.now()
  const startMs = startNow ? nowMs : Date.parse(wibIso(startDate || today, startTime || '00:00'))
  const endMs = timeMode === 'window' && endDate && endTime ? Date.parse(wibIso(endDate, endTime)) : NaN
  let timeError = ''
  if (!startNow && (!startDate || !startTime)) timeError = 'Lengkapi tanggal dan jam mulai.'
  else if (timeMode === 'window') {
    if (!endDate || !endTime) timeError = 'Lengkapi tanggal dan jam selesai.'
    else if (endMs <= nowMs) timeError = 'Waktu selesai sudah lewat.'
    else if (endMs <= startMs) timeError = 'Waktu selesai harus setelah waktu mulai.'
  }

  const startText = startNow ? 'Sekarang' : wibStamp(wibIso(startDate || today, startTime || '00:00'))
  const whenText =
    timeMode === 'expired'
      ? `${startNow ? 'Mulai sekarang' : `Mulai ${startText}`}, sampai tiap barang expired`
      : `${startText} – ${endDate && endTime ? (endDate === (startNow ? today : startDate) ? wibTime(wibIso(endDate, endTime)) : wibStamp(wibIso(endDate, endTime))) : '…'}`

  function toggle(id: number) {
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  const allPicked = candidates.length > 0 && candidates.every((b) => picked.has(b.batch_id))
  function toggleAll() {
    setPicked((s) => {
      const n = new Set(s)
      if (allPicked) for (const b of candidates) n.delete(b.batch_id)
      else for (const b of candidates) n.add(b.batch_id)
      return n
    })
  }

  function chooseType(t: DiscountType) {
    setType(t)
    setValue(t === 'percent' ? '30' : '2000')
  }

  function applyPreset(kind: 'sisa' | 'sore' | 'malam' | 'besok') {
    setTimeMode('window')
    const tomorrow = addDays(today, 1)
    if (kind === 'sisa') {
      setStartNow(true)
      setEndDate(today)
      setEndTime('23:55')
    } else if (kind === 'besok') {
      setStartNow(false)
      setStartDate(tomorrow)
      setStartTime('00:00')
      setEndDate(tomorrow)
      setEndTime('23:55')
    } else {
      setStartNow(false)
      setStartDate(today)
      setStartTime(kind === 'sore' ? '15:00' : '18:00')
      setEndDate(today)
      setEndTime(kind === 'sore' ? '18:00' : '21:00')
    }
  }

  async function start(e: FormEvent) {
    e.preventDefault()
    if (pickedRows.length === 0) return notify('Pilih minimal satu barang untuk dipromokan.', 'error')
    if (!valueOk) return notify(type === 'percent' ? 'Diskon harus angka bulat antara 1 sampai 90.' : 'Potongan harus angka bulat lebih dari 0.', 'error')
    if (timeError) return notify(timeError, 'error')
    if (name.trim() === '') return notify('Nama promo wajib diisi.', 'error')

    const ok = await confirm({
      title: startNow ? 'Mulai promo?' : 'Jadwalkan promo?',
      message: `${pickedRows.length} barang didiskon ${discountLabel(type, num)}${type === 'nominal' ? ' per pcs' : ''} (${shareLabel(share)}). ${whenText}.${
        startNow ? ' Harga di Kasir langsung berubah.' : ' Harga di Kasir berubah otomatis saat jadwalnya tiba.'
      }${losing > 0 ? ` ${losing} barang akan dijual di bawah harga setoran.` : ''}${free > 0 ? ` ${free} barang menjadi gratis.` : ''}`,
      confirmText: startNow ? 'Ya, mulai promo' : 'Ya, jadwalkan',
    })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('promo_rule_create', {
      p_name: name.trim(),
      p_type: type,
      p_value: num,
      p_supplier_share: share,
      p_note: note.trim() || null,
      p_batch_ids: pickedRows.map((b) => b.batch_id),
      p_start_at: startNow ? null : wibIso(startDate, startTime),
      p_end_mode: timeMode === 'window' ? 'at' : 'expired',
      p_end_at: timeMode === 'window' ? wibIso(endDate, endTime) : null,
    })
    setBusy(false)
    if (error) {
      notify(errText(error), 'error')
      await load(true)
      return
    }
    notify(startNow ? 'Promo dimulai. Harga di Kasir sudah berubah.' : 'Promo dijadwalkan. Harga berubah otomatis saat waktunya tiba.')
    setPicked(new Set())
    setNote('')
    window.dispatchEvent(new Event(ALERTS_REFRESH_EVENT))
    await load(true)
  }

  async function stop(c: PromoCampaign) {
    const scheduled = c.status === 'terjadwal'
    const ok = await confirm({
      title: scheduled ? 'Batalkan promo terjadwal?' : 'Hentikan promo?',
      message: scheduled
        ? `Promo "${c.name}" belum mulai dan akan dibatalkan.`
        : `Harga barang di promo "${c.name}" dikembalikan ke harga normal. Penjualan yang sudah terjadi tidak berubah.`,
      confirmText: scheduled ? 'Ya, batalkan' : 'Ya, hentikan',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    const { error } = c.legacy
      ? await supabase.rpc('promo_stop', { p_campaign_id: c.id })
      : await supabase.rpc('promo_rule_stop', { p_rule_id: c.id })
    setBusy(false)
    if (error) return notify(errText(error), 'error')
    notify(scheduled ? 'Promo dibatalkan.' : 'Promo dihentikan dan harga dikembalikan.')
    window.dispatchEvent(new Event(ALERTS_REFRESH_EVENT))
    await load(true)
  }

  function toggleOpen(key: string) {
    setOpenIds((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }

  if (setupNeeded) {
    return (
      <div className="promo">
        <PageHeader title="Promo & Diskon" />
        <div className="pm-setup">
          <Sparkles size={22} />
          <h2>Fitur promo baru belum dipasang</h2>
          <p>
            Buka Supabase → SQL Editor, tempel isi file <code>{PROMO_V2_SQL_FILE}</code>, lalu jalankan. Setelah itu muat ulang halaman ini.
          </p>
        </div>
      </div>
    )
  }

  const shareHint = SHARE_OPTIONS.find((o) => o.value === share)?.hint
  const running = campaigns.filter((c) => c.status === 'aktif').length
  const scheduled = campaigns.filter((c) => c.status === 'terjadwal').length
  const submitDisabled = busy || pickedRows.length === 0 || !valueOk || !!timeError

  return (
    <div className="promo">
      <PageHeader title="Promo & Diskon" subtitle="Diskon persen atau nominal, berlaku sampai expired atau pada jam tertentu. Harga di Kasir berubah otomatis." />

      {loading ? (
        <div className="pm-skel">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : (
        <>
          <div className="pm-kpis">
            <div className="pm-kpi"><span>Sedang berjalan</span><b>{running}</b><i className={running > 0 ? 'live' : ''} /></div>
            <div className="pm-kpi"><span>Terjadwal</span><b>{scheduled}</b></div>
            <div className="pm-kpi"><span>Barang ikut promo</span><b>{onPromo.size}</b></div>
          </div>

          {isAdmin ? (
            <form noValidate onSubmit={(ev) => void start(ev)} className="pm-layout">
              <div className="pm-steps">
                <Step n={1} title="Pilih barang" sub="Barang yang masih ada stok dan belum expired.">
                  <div className="pm-row">
                    <Seg
                      label="Cakupan barang"
                      value={scope}
                      onChange={setScope}
                      options={[
                        { value: 'expiring', label: 'Hampir expired' },
                        { value: 'all', label: 'Semua stok' },
                      ]}
                    />
                    <label className="pm-search">
                      <Search size={16} />
                      <input placeholder="Cari barang atau supplier" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </label>
                  </div>
                  {scope === 'expiring' && (
                    <div className="pm-chips" role="group" aria-label="Batas expired">
                      {EXP_WINDOWS.map((w) => (
                        <button type="button" key={w.days} className={`pm-chip${expDays === w.days ? ' on' : ''}`} onClick={() => setExpDays(w.days)}>
                          Expired {w.label.toLowerCase()}
                        </button>
                      ))}
                    </div>
                  )}

                  {candidates.length === 0 ? (
                    <p className="pm-empty">
                      {scope === 'expiring' ? 'Tidak ada barang yang expired dalam rentang ini (atau semuanya sudah ikut promo). Coba pilih "Semua stok".' : 'Tidak ada barang yang cocok.'}
                    </p>
                  ) : (
                    <>
                      <div className="pm-listhead">
                        <label className="pm-all">
                          <input type="checkbox" checked={allPicked} onChange={toggleAll} /> Pilih semua ({candidates.length})
                        </label>
                        {pickedRows.length > 0 && <span className="pm-count">{pickedRows.length} dipilih</span>}
                      </div>
                      <div className="pm-list">
                        {shown.map((b) => {
                          const p = products.get(b.product_id)
                          const on = picked.has(b.batch_id)
                          return (
                            <label key={b.batch_id} className={`pm-pick${on ? ' on' : ''}`}>
                              <input type="checkbox" checked={on} onChange={() => toggle(b.batch_id)} />
                              <span className="pm-check"><Check size={14} strokeWidth={3} /></span>
                              {p?.image_path ? <img className="pm-thumb" src={imageUrl(p.image_path)} alt="" loading="lazy" /> : <span className="pm-thumb" />}
                              <span className="pm-pick-main">
                                <strong>{p?.name ?? '-'}</strong>
                                <small>{suppliers.get(b.supplier_id) ?? '-'} · sisa {b.qty_remaining} · {rupiah(b.sell_price)}</small>
                              </span>
                              <span className={`pm-exp ${b.sellable_until <= addDays(today, 1) ? 'hot' : b.sellable_until <= addDays(today, 3) ? 'warm' : ''}`}>
                                {expiredLabel(b.sellable_until, today)}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                      {candidates.length > shown.length && <p className="pm-more">Menampilkan {shown.length} dari {candidates.length}. Gunakan pencarian untuk mempersempit.</p>}
                    </>
                  )}
                </Step>

                <Step n={2} title="Besar diskon" sub="Persen dari harga jual, atau potongan rupiah per pcs.">
                  <Seg
                    label="Jenis diskon"
                    value={type}
                    onChange={chooseType}
                    options={[
                      { value: 'percent', label: 'Persen', icon: <Percent size={15} /> },
                      { value: 'nominal', label: 'Nominal', icon: <Banknote size={15} /> },
                    ]}
                  />
                  <div className="pm-chips" role="group" aria-label="Pilihan cepat">
                    {QUICK[type].map((v) => (
                      <button type="button" key={v} className={`pm-chip${value === String(v) ? ' on' : ''}`} onClick={() => setValue(String(v))}>
                        {type === 'percent' ? `${v}%` : rupiah(v)}
                      </button>
                    ))}
                  </div>
                  <label className="pm-field narrow">
                    <span>{type === 'percent' ? 'Atau ketik sendiri (1–90)' : 'Atau ketik sendiri (potongan per pcs)'}</span>
                    <div className="pm-input">
                      {type === 'nominal' && <i>Rp</i>}
                      <input type="number" min={1} max={type === 'percent' ? 90 : undefined} inputMode="numeric" value={value} onFocus={(ev) => ev.currentTarget.select()} onChange={(ev) => setValue(ev.target.value)} />
                      {type === 'percent' && <i>%</i>}
                    </div>
                  </label>
                </Step>

                <Step n={3} title="Kapan berlaku" sub="Sampai barang expired, atau pada jam yang kamu tentukan.">
                  <div className="pm-options">
                    <button type="button" className={`pm-opt${timeMode === 'expired' ? ' on' : ''}`} onClick={() => setTimeMode('expired')} aria-pressed={timeMode === 'expired'}>
                      <Hourglass size={20} />
                      <strong>Sampai expired</strong>
                      <small>Tiap barang berhenti promo di tanggal expirednya.</small>
                    </button>
                    <button type="button" className={`pm-opt${timeMode === 'window' ? ' on' : ''}`} onClick={() => setTimeMode('window')} aria-pressed={timeMode === 'window'}>
                      <CalendarClock size={20} />
                      <strong>Atur jam</strong>
                      <small>Dari jam tertentu sampai jam tertentu.</small>
                    </button>
                  </div>

                  <div className="pm-when">
                    <div className="pm-when-row">
                      <span className="pm-when-label">Mulai</span>
                      <Seg
                        label="Waktu mulai"
                        value={startNow ? 'now' : 'later'}
                        onChange={(v) => setStartNow(v === 'now')}
                        options={[
                          { value: 'now', label: 'Sekarang', icon: <Zap size={14} /> },
                          { value: 'later', label: 'Jadwalkan' },
                        ]}
                      />
                    </div>
                    {!startNow && (
                      <div className="pm-datetime">
                        <DatePicker value={startDate} min={today} onChange={setStartDate} ariaLabel="Tanggal mulai" />
                        <TimePicker value={startTime} onChange={setStartTime} ariaLabel="Jam mulai" presets={TIME_PRESETS} />
                      </div>
                    )}

                    {timeMode === 'window' && (
                      <>
                        <div className="pm-when-row">
                          <span className="pm-when-label">Selesai</span>
                          <div className="pm-chips tight" role="group" aria-label="Contoh jadwal">
                            <button type="button" className="pm-chip" onClick={() => applyPreset('sisa')}>Sisa hari ini</button>
                            <button type="button" className="pm-chip" onClick={() => applyPreset('sore')}>Sore 15–18</button>
                            <button type="button" className="pm-chip" onClick={() => applyPreset('malam')}>Malam 18–21</button>
                            <button type="button" className="pm-chip" onClick={() => applyPreset('besok')}>Besok seharian</button>
                          </div>
                        </div>
                        <div className="pm-datetime">
                          <DatePicker value={endDate} min={startNow ? today : startDate || today} onChange={setEndDate} ariaLabel="Tanggal selesai" />
                          <TimePicker value={endTime} onChange={setEndTime} ariaLabel="Jam selesai" presets={TIME_PRESETS} />
                        </div>
                      </>
                    )}
                    {timeError && (
                      <div className="notice notice-error">
                        <TriangleAlert size={18} />
                        <span>{timeError}</span>
                      </div>
                    )}
                  </div>
                </Step>

                <Step n={4} title="Siapa yang menanggung potongan?">
                  <Seg label="Penanggung potongan" value={share} onChange={setShare} options={SHARE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
                  <p className="pm-hint">{shareHint}</p>
                  {share > 0 && (
                    <div className="notice notice-info">
                      <Info size={18} />
                      <span>Pastikan supplier sudah setuju. Catatan promo ini otomatis muncul di rekap setoran dan pesan WhatsApp ke supplier.</span>
                    </div>
                  )}
                </Step>

                <Step n={5} title="Nama dan catatan">
                  <label className="pm-field">
                    <span>Nama promo <span className="req">*</span></span>
                    <input value={name} onChange={(e) => setName(e.target.value)} />
                  </label>
                  <label className="pm-field">
                    <span>Catatan untuk supplier <em>(opsional)</em></span>
                    <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: barang dipromokan karena expired besok, sudah disepakati lewat WhatsApp." />
                  </label>
                </Step>
              </div>

              <aside className="pm-aside">
                <div className="pm-summary">
                  <div className="pm-sum-head">
                    <span>Ringkasan</span>
                    <b>{pickedRows.length} barang</b>
                  </div>
                  <div className="pm-sum-line"><Percent size={15} /> {valueOk ? `Diskon ${discountLabel(type, num)}${type === 'nominal' ? ' / pcs' : ''}` : 'Isi besar diskon'}</div>
                  <div className="pm-sum-line"><CalendarClock size={15} /> {whenText}</div>
                  <div className="pm-sum-line"><Info size={15} /> {shareLabel(share)}</div>

                  {preview.length > 0 ? (
                    <ul className="pm-prices">
                      {preview.map(({ b, pp, pc, margin }) => (
                        <li key={b.batch_id}>
                          <span className="pm-p-name">{products.get(b.product_id)?.name ?? '-'}</span>
                          <span className="pm-p-now"><s>{rupiah(b.sell_price)}</s><b>{pp === 0 ? 'Gratis' : rupiah(pp)}</b></span>
                          <small className={margin < 0 ? 'neg' : ''}>setoran {rupiah(pc)} · untung {rupiah(margin)}/pcs</small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="pm-sum-empty">Pilih barang di langkah 1 untuk melihat harga setelah diskon.</p>
                  )}

                  {losing > 0 && (
                    <div className="notice notice-warning">
                      <TriangleAlert size={18} />
                      <span>{losing} barang dijual di bawah harga setoran, jadi toko rugi per pcs. Kecilkan diskon atau naikkan bagian supplier.</span>
                    </div>
                  )}
                  {free > 0 && (
                    <div className="notice notice-warning">
                      <TriangleAlert size={18} />
                      <span>{free} barang menjadi gratis karena potongan sama dengan atau lebih besar dari harganya.</span>
                    </div>
                  )}
                </div>
                <div className="pm-cta">
                  <button className="btn-primary pm-go" disabled={submitDisabled}>
                    <Sparkles size={17} />
                    {busy ? 'Memproses…' : startNow ? `Mulai promo${pickedRows.length > 0 ? ` (${pickedRows.length})` : ''}` : `Jadwalkan promo${pickedRows.length > 0 ? ` (${pickedRows.length})` : ''}`}
                  </button>
                </div>
              </aside>
            </form>
          ) : (
            <div className="notice notice-info" style={{ marginBottom: 16 }}>
              <Info size={18} />
              <span>Hanya admin yang bisa membuat atau menghentikan promo. Promo yang berjalan tetap otomatis berlaku di Kasir.</span>
            </div>
          )}

          <section className="pm-history">
            <h2>Promo berjalan dan riwayat</h2>
            {campaigns.length === 0 ? (
              <EmptyState title="Belum ada promo" text="Promo yang kamu buat akan muncul di sini beserta hasil penjualannya." />
            ) : (
              <div className="pm-cards">
                {campaigns.map((c, idx) => {
                  const t = totals(c)
                  const key = `${c.legacy ? 'l' : 'n'}${c.id}`
                  const open = openIds.has(key)
                  const pct = t.start > 0 ? Math.min(100, Math.round((t.sold / t.start) * 100)) : 0
                  return (
                    <article className={`pm-card ${c.status}`} key={key} style={{ '--d': Math.min(idx, 8) } as CSSProperties}>
                      <header>
                        <div className="pm-card-title">
                          <span className={`pm-dot ${c.status}`} aria-hidden="true" />
                          <strong>{c.name}</strong>
                          {c.legacy && <span className="pm-legacy">Promo lama</span>}
                        </div>
                        <span className={`pm-status ${c.status}`}>{c.status === 'aktif' ? 'Berjalan' : c.status === 'terjadwal' ? 'Terjadwal' : 'Selesai'}</span>
                      </header>

                      <div className="pm-meta">
                        <span className="pm-tag">{discountLabel(c.discount_type, c.discount_value)}{c.discount_type === 'nominal' ? ' / pcs' : ''}</span>
                        <span>{c.legacy ? `mulai ${shortDate(c.started_on)}${c.ended_on ? ` · selesai ${shortDate(c.ended_on)}` : ''}` : windowLabel(c)}</span>
                        <span>· {shareLabel(c.supplier_share)}</span>
                      </div>

                      {t.start > 0 && c.status !== 'terjadwal' && (
                        <div className="pm-progress" title={`${t.sold} dari ${t.start} pcs terjual`}>
                          <i style={{ width: `${pct}%` }} />
                        </div>
                      )}

                      <div className="pm-stats">
                        <div><span>Terjual</span><b>{t.sold} pcs</b></div>
                        <div><span>Omzet promo</span><b>{rupiah(t.revenue)}</b></div>
                        <div><span>Total potongan</span><b>{rupiah(t.discount)}</b></div>
                        <div><span>Toko</span><b>{rupiah(t.store)}</b></div>
                        <div><span>Supplier</span><b>{rupiah(t.supplier)}</b></div>
                        {c.status === 'aktif' && <div><span>Sisa stok promo</span><b>{t.left} pcs</b></div>}
                      </div>

                      {c.supplier_note && <p className="pm-note">Catatan untuk supplier: {c.supplier_note}</p>}

                      <div className="pm-card-actions">
                        <button type="button" className="pm-toggle" onClick={() => toggleOpen(key)} aria-expanded={open}>
                          <ChevronDown size={16} className={open ? 'up' : ''} /> {open ? 'Sembunyikan rincian' : `Rincian ${c.items.length} barang`}
                        </button>
                        {isAdmin && c.status !== 'selesai' && (
                          <button type="button" className="btn-sm btn-danger" onClick={() => void stop(c)} disabled={busy}>
                            {c.status === 'terjadwal' ? 'Batalkan' : 'Hentikan promo'}
                          </button>
                        )}
                      </div>

                      {open && (
                        <div className="pm-items table-wrap">
                          <table className="tbl" style={{ minWidth: 480 }}>
                            <thead>
                              <tr>
                                <th>Barang</th>
                                <th>Supplier</th>
                                <th className="num">Normal → promo</th>
                                <th className="num">Terjual</th>
                                <th className="num">Sisa</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.items.map((i) => (
                                <tr key={i.batch_id}>
                                  <td>{i.product_name}</td>
                                  <td>{i.supplier_name}</td>
                                  <td className="num">{rupiah(i.original_price)} → <b>{rupiah(i.promo_price)}</b></td>
                                  <td className="num">{i.qty_sold}</td>
                                  <td className="num">{i.active ? i.qty_remaining : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
