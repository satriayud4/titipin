import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarOff, Check, ChevronLeft, ChevronRight, Clock, ClipboardList, Pencil, Store, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import PageHeader from '../components/PageHeader'
import DayTimeline from '../components/kalender/DayTimeline'
import { DayStatusModal, HoursModal, OrderDetailModal, OrderModal } from '../components/kalender/KalenderModals'
import { ALERTS_REFRESH_EVENT } from '../lib/alerts'
import { addDays } from '../lib/dates'
import { errText } from '../lib/errors'
import { 
  ORDER_SOURCE,
  STATUS_LABEL,
  WEEK_HEAD,
  byDueTime,
  detailsPreview,
  durationText,
  fmtRange,
  fmtTime,
  gridRange,
  initialOf,
  longDate,
  monthLabel,
  monthOf,
  nowWIB,
  orderUrgency,
  resolveDay,
  shiftMonth,
  staffHue,
  toCashierShift,
  toMin,
  urgencyTone,
  weeklyInfo,
  type DayInfo,
  type CashierShift,
  type CashierShiftRow,
  type HourRow,
  type OrderRow,
  type OrderStatus,
  type OverrideRow,
  type Tone,
} from '../lib/kalender'
import './Kalender.css'

interface MonthData {
  overrides: OverrideRow[]
  shifts: CashierShiftRow[]
  orders: OrderRow[]
}
type ModalState =
  | null
  | { type: 'hours' }
  | { type: 'day' }
  | { type: 'orderView'; order: OrderRow }
  | { type: 'order'; order: OrderRow }

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
const hueStyle = (name: string) => ({ '--h': staffHue(name) }) as CSSProperties

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(nowWIB)
  useEffect(() => {
    const tick = () => setNow(nowWIB())
    const id = window.setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [intervalMs])
  return now
}

function Tag({ tone, children }: { tone: Tone; children: string }) {
  return <span className={`kal-tag ${tone}`}>{children}</span>
}

function statusOf(info: DayInfo, nowMin: number) {
  if (info.closed) return { tone: 'closed', title: 'Tutup hari ini', sub: info.note || 'Tidak ada jam buka.' }
  const o = toMin(info.open ?? '00:00')
  const c = toMin(info.close ?? '23:59')
  if (nowMin < o) return { tone: 'soon', title: 'Belum buka', sub: `Buka pukul ${fmtTime(info.open)}, ${durationText(o - nowMin)} lagi` }
  if (nowMin < c) return { tone: 'open', title: 'Buka sekarang', sub: `Tutup pukul ${fmtTime(info.close)}, ${durationText(c - nowMin)} lagi` }
  return { tone: 'done', title: 'Sudah tutup', sub: `Tutup sejak pukul ${fmtTime(info.close)}` }
}

export default function Kalender() {
  const notify = useToast()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || !!profile?.is_superadmin
  const now = useNow()
  const today = now.date
  const [params] = useSearchParams()

  const [selected, setSelected] = useState(() => {
    const q = params.get('tanggal')
    return isDate(q) ? q : nowWIB().date
  })
  const [anchor, setAnchor] = useState(() => monthOf(selected))
  const [hours, setHours] = useState<HourRow[]>([])
  const [data, setData] = useState<MonthData>({ overrides: [], shifts: [], orders: [] })
  const [urgent, setUrgent] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [modal, setModal] = useState<ModalState>(null)

  const gridRef = useRef<HTMLDivElement>(null)
  const refocus = useRef(false)

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1)
    window.dispatchEvent(new Event(ALERTS_REFRESH_EVENT))
  }, [])

  // data bulan yg tampil (+ hari ini, bila di luar bulan itu)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { from, to } = gridRange(anchor)
      const ranges: [string, string][] = [[from, to]]
      if (today < from || today > to) ranges.push([today, today])

      const [h, u, rs] = await Promise.all([
        supabase.from('store_hours').select('weekday, is_open, open_time, close_time').order('weekday'),
        supabase
          .from('scheduled_orders')
          .select('*')
          .eq('source', ORDER_SOURCE)
          .in('status', ['pending', 'processing'])
          .lte('due_date', addDays(today, 7))
          .order('due_date')
          .order('due_time'),
        Promise.all(
          ranges.map(([a, b]) =>
            Promise.all([
              supabase.from('day_overrides').select('*').gte('day', a).lte('day', b),
              supabase.rpc('calendar_cashier_shifts', { p_from: a, p_to: b }),
              supabase.from('scheduled_orders').select('*').eq('source', ORDER_SOURCE).gte('due_date', a).lte('due_date', b),
            ]),
          ),
        ),
      ])
      if (cancelled) return

      const firstError = [h.error, u.error, ...rs.flatMap((r) => r.map((x) => x.error))].find(Boolean)
      if (firstError) {
        const e = firstError as { code?: string; message?: string }
        if (['PGRST205', 'PGRST202', '42P01', '42703', '42883'].includes(e.code ?? '') || e.message?.includes('schema cache')) setSetupNeeded(true)
        else notify(errText(firstError), 'error')
        setLoading(false)
        return
      }
      setSetupNeeded(false)
      setHours((h.data ?? []) as HourRow[])
      setUrgent((u.data ?? []) as OrderRow[])
      setData({
        overrides: rs.flatMap((r) => (r[0].data ?? []) as OverrideRow[]),
        shifts: rs.flatMap((r) => (r[1].data ?? []) as CashierShiftRow[]),
        orders: rs.flatMap((r) => (r[2].data ?? []) as OrderRow[]),
      })
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [anchor, today, reloadKey, notify])

  // muat ulang saat tab kembali dibuka, supaya perubahan rekan kerja ikut terlihat
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setReloadKey((k) => k + 1)
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  /* ---------- turunan ---------- */
  const days = useMemo(() => gridRange(anchor).days, [anchor])
  const shiftsByDay = useMemo(() => {
    const m = new Map<string, CashierShift[]>()
    for (const row of data.shifts) {
      const s = toCashierShift(row, { date: now.date, min: now.min })
      m.set(s.day, [...(m.get(s.day) ?? []), s])
    }
    for (const list of m.values()) list.sort((a, b) => a.start_time.localeCompare(b.start_time) || a.id - b.id)
    return m
  }, [data.shifts, now.date, now.min])
  const ordersByDay = useMemo(() => {
    const m = new Map<string, OrderRow[]>()
    for (const o of data.orders) m.set(o.due_date, [...(m.get(o.due_date) ?? []), o])
    for (const list of m.values()) list.sort(byDueTime)
    return m
  }, [data.orders])

  const infoOf = (d: string) => resolveDay(d, hours, data.overrides)
  const todayInfo = infoOf(today)
  const todayShifts = shiftsByDay.get(today) ?? []
  const status = statusOf(todayInfo, now.min)
  // semua kasir yang shift-nya masih terbuka (termasuk yang lupa ditutup dari hari sebelumnya)
  const onDuty = [...shiftsByDay.values()].flat().filter((s) => s.active)

  const selInfo = infoOf(selected)
  const selShifts = shiftsByDay.get(selected) ?? []
  const selOrders = ordersByDay.get(selected) ?? []
  const selOverride = data.overrides.find((o) => o.day === selected)
  const stale = (s: CashierShift) => s.active && s.day !== today

  const attention = urgent
    .map((o) => ({ o, u: orderUrgency(o, now) }))
    .filter(({ u }) => u.level !== 'later' && u.level !== 'none')
  const attentionHot = attention.filter(({ u }) => u.level === 'overdue' || u.level === 'soon').length

  /* ---------- aksi ---------- */
  function selectDate(d: string) {
    setSelected(d)
    if (monthOf(d) !== anchor) setAnchor(monthOf(d))
  }

  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key]
    if (!step) return
    e.preventDefault()
    refocus.current = true
    selectDate(addDays(selected, step))
  }
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)?.focus()
  }, [selected, anchor])

  async function setOrderStatus(o: OrderRow, next: OrderStatus) {
    const { error } = await supabase.from('scheduled_orders').update({ status: next }).eq('id', o.id)
    if (error) {
      notify(errText(error), 'error')
      return
    }
    notify(next === 'done' ? 'Pesanan ditandai selesai.' : 'Status pesanan diperbarui.')
    reload()
  }

  const done = () => {
    setModal(null)
    reload()
  }

  /* ---------- tampilan ---------- */
  if (setupNeeded) {
    return (
      <div className="kal">
        <PageHeader title="Kalender & Operasional" />
        <div className="card kal-setup">
          <h2>Tabel kalender belum dibuat</h2>
          <p>
            Buka Supabase → SQL Editor, tempel isi file <code>supabase/kalender.sql</code>, lalu jalankan. Setelah itu muat ulang halaman ini.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="kal">
      <PageHeader
        title="Kalender & Operasional"
        subtitle="Jam buka, shift kasir, dan pesanan paket dalam satu tampilan."
        actions={
          <>
            {isAdmin && (
              <button type="button" onClick={() => setModal({ type: 'hours' })}>
                <Clock size={16} /> Jam mingguan
              </button>
            )}
          </>
        }
      />

      {/* ===== Hari ini ===== */}
      <section className="card kal-hero" aria-label="Hari ini">
        {loading ? (
          <div className="kal-loading" aria-busy="true">Memuat jadwal…</div>
        ) : (
          <>
            <div className="kal-hero-main">
              <div className="kal-hero-top">
                <div className={`kal-status ${status.tone}`} role="status">
                  <span className="kal-status-dot" />
                  <div>
                    <strong>{status.title}</strong>
                    <span>{status.sub}</span>
                  </div>
                </div>
                <span className="kal-date">{longDate(today)}</span>
              </div>

              <div className="kal-onduty">
                {onDuty.length > 0 ? (
                  <>
                    <span>Kasir yang sedang buka shift</span>
                    {onDuty.map((s) => (
                      <span className="kal-person" key={s.id} style={hueStyle(s.staff_name)}>
                        <i>{initialOf(s.staff_name)}</i>
                        {s.staff_name}
                        {stale(s) && <small> · sejak {s.day.slice(8)}/{s.day.slice(5, 7)}</small>}
                      </span>
                    ))}
                  </>
                ) : (
                  <span>
                    {todayShifts.length === 0 ? 'Belum ada kasir yang membuka shift hari ini.' : 'Semua shift kasir hari ini sudah ditutup.'}
                  </span>
                )}
              </div>

              {todayInfo.closed && todayShifts.length === 0 ? (
                <div className="kal-closed-card">
                  <CalendarOff size={20} />
                  <span>{todayInfo.note ? `Tutup: ${todayInfo.note}` : 'Toko tutup hari ini.'}</span>
                </div>
              ) : (
                <DayTimeline
                  open={todayInfo.open}
                  close={todayInfo.close}
                  shifts={todayShifts}
                  nowMin={now.min}
                />
              )}
            </div>

            <aside className="kal-hero-side" aria-label="Pesanan yang perlu diperhatikan">
              <div className="kal-sec-head">
                <h2>Perlu diperhatikan</h2>
                {attentionHot > 0 && <Tag tone="danger">{`${attentionHot} mepet`}</Tag>}
              </div>
              {attention.length === 0 ? (
                <p className="kal-empty">
                  <Check size={16} /> Tidak ada pesanan yang mepet.
                </p>
              ) : (
                <div className="kal-rows">
                  {attention.slice(0, 4).map(({ o, u }) => (
                    <button
                      type="button"
                      key={o.id}
                      className={`kal-row kal-order ${urgencyTone(u.level)}`}
                      onClick={() => {
                        selectDate(o.due_date)
                        setModal({ type: 'orderView', order: o })
                      }}
                    >
                      <span className="kal-row-main">
                        <strong>{o.title}</strong>
                        <small>{detailsPreview(o.details) || 'Pesanan supplier'}</small>
                      </span>
                      <Tag tone={urgencyTone(u.level)}>{u.label}</Tag>
                    </button>
                  ))}
                  {attention.length > 4 && <p className="kal-empty">+{attention.length - 4} pesanan lain, lihat di kalender.</p>}
                </div>
              )}
            </aside>
          </>
        )}
      </section>

      <div className="kal-main">
        {/* ===== Kalender bulanan ===== */}
        <section className="card kal-cal" aria-label="Kalender bulanan">
          <div className="kal-cal-head">
            <h2 aria-live="polite">{monthLabel(anchor)}</h2>
            <div className="kal-nav">
              <button type="button" className="icon-btn" aria-label="Bulan sebelumnya" onClick={() => setAnchor(shiftMonth(anchor, -1))}>
                <ChevronLeft size={20} />
              </button>
              <button type="button" className="btn-sm" onClick={() => selectDate(today)}>
                Hari ini
              </button>
              <button type="button" className="icon-btn" aria-label="Bulan berikutnya" onClick={() => setAnchor(shiftMonth(anchor, 1))}>
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="kal-week" aria-hidden="true">
            {WEEK_HEAD.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className="kal-grid" ref={gridRef} onKeyDown={onGridKey} role="group" aria-label="Pilih tanggal">
            {days.map((d) => {
              const info = infoOf(d)
              const shifts = shiftsByDay.get(d) ?? []
              const orders = ordersByDay.get(d) ?? []
              const live = orders.filter((o) => o.status === 'pending' || o.status === 'processing')
              const worst = live.reduce<Tone>((t, o) => {
                const tone = urgencyTone(orderUrgency(o, now).level)
                const rank: Record<Tone, number> = { danger: 3, warning: 2, info: 1, muted: 0, success: 0 }
                return rank[tone] > rank[t] ? tone : t
              }, 'muted')
              const label = `${longDate(d)}, ${info.closed ? 'tutup' : `buka ${fmtRange(info.open ?? '', info.close ?? '')}`}, ${shifts.length} shift kasir, ${live.length} pesanan paket`

              return (
                <button
                  type="button"
                  key={d}
                  data-date={d}
                  tabIndex={d === selected ? 0 : -1}
                  aria-label={label}
                  aria-pressed={d === selected}
                  aria-current={d === today ? 'date' : undefined}
                  className={[
                    'kal-cell',
                    monthOf(d) !== anchor ? 'out' : '',
                    d === selected ? 'is-sel' : '',
                    d === today ? 'is-today' : '',
                    info.closed ? 'is-closed' : '',
                  ].join(' ')}
                  onClick={() => selectDate(d)}
                >
                  <span className="kal-num">{Number(d.slice(8))}</span>
                  {info.closed && <span className="kal-closed">Tutup</span>}
                  <span className="kal-chips">
                    {shifts.length > 0 && (
                      <span className="kal-chip">
                        <Users size={12} /> {shifts.length}
                      </span>
                    )}
                    {live.length > 0 && (
                      <span className={`kal-chip ${worst}`}>
                        <ClipboardList size={12} /> {live.length}
                      </span>
                    )}
                  </span>
                  <span className="kal-dots" aria-hidden="true">
                    {shifts.length > 0 && <i className="kal-dot shift" />}
                    {live.length > 0 && <i className={`kal-dot ${worst}`} />}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="kal-legend" aria-hidden="true">
            <span><i className="kal-dot shift" /> Ada shift kasir</span>
            <span><i className="kal-dot warning" /> Ada pesanan paket</span>
            <span><i className="kal-dot danger" /> Pesanan mepet</span>
            <span><i className="kal-swatch" /> Tutup</span>
          </div>
        </section>

        {/* ===== Detail tanggal ===== */}
        <aside className="card kal-detail" aria-label={`Detail ${longDate(selected)}`} key={selected}>
          <div className="kal-detail-head">
            <div>
              <h2>{longDate(selected)}</h2>
              <p className={`kal-hours-line${selInfo.closed ? ' closed' : ''}`}>
                {selInfo.closed ? <CalendarOff size={16} /> : <Store size={16} />}
                {selInfo.closed
                  ? `Tutup${selInfo.note ? `: ${selInfo.note}` : ''}`
                  : `Buka ${fmtRange(selInfo.open ?? '', selInfo.close ?? '')}${selInfo.note ? ` · ${selInfo.note}` : ''}`}
              </p>
              {selInfo.custom && <small>Diubah khusus tanggal ini</small>}
            </div>
            {isAdmin && (
              <button type="button" className="btn-sm" onClick={() => setModal({ type: 'day' })}>
                <Pencil size={14} /> Atur jam
              </button>
            )}
          </div>

          {selected !== today && (selShifts.length > 0 || !selInfo.closed) && (
            <DayTimeline
              open={selInfo.open}
              close={selInfo.close}
              shifts={selShifts}
              nowMin={null}
            />
          )}

          <div className="kal-sec">
            <div className="kal-sec-head">
              <h3>Shift kasir</h3>
            </div>
            {selShifts.length === 0 ? (
              <p className="kal-empty">
                {selected > today ? 'Shift kasir muncul setelah kasir membuka shift.' : 'Tidak ada kasir yang membuka shift di tanggal ini.'}
              </p>
            ) : (
              <div className="kal-rows">
                {selShifts.map((s) => (
                  <div className="kal-row" key={s.id} style={hueStyle(s.staff_name)}>
                    <span className="kal-avatar">{initialOf(s.staff_name)}</span>
                    <span className="kal-row-main">
                      <strong>{s.staff_name}</strong>
                      <small>{s.active ? (stale(s) ? 'Belum ditutup' : 'Sedang berjalan') : 'Sudah ditutup'}</small>
                    </span>
                    <span className="kal-time">{s.active ? `${fmtTime(s.start_time)} – …` : fmtRange(s.start_time, s.end_time)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="kal-sec">
            <div className="kal-sec-head">
              <h3>Pesanan paket</h3>
            </div>
            {selOrders.length === 0 ? (
              <p className="kal-empty">
                <span>
                  Belum ada pesanan di tanggal ini. Pesanan muncul di sini setelah dibuat di halaman <Link to="/pembelian-paket">Pembelian Paket</Link>.
                </span>
              </p>
            ) : (
              <div className="kal-rows">
                {selOrders.map((o) => {
                  const u = orderUrgency(o, now)
                  const tone = o.status === 'done' ? 'success' : o.status === 'cancelled' ? 'muted' : urgencyTone(u.level)
                  const open = o.status === 'pending' || o.status === 'processing'
                  return (
                    <div className={`kal-row kal-order ${tone}${open ? '' : ' finished'}`} key={o.id}>
                      <button type="button" className="kal-row-hit" onClick={() => setModal({ type: 'orderView', order: o })}>
                        <span className="kal-row-main">
                          <strong>{o.title}</strong>
                          <small>
                            {[o.due_time ? fmtTime(o.due_time) : null, detailsPreview(o.details) || 'Pesanan supplier'].filter(Boolean).join(' · ')}
                          </small>
                        </span>
                        {open && u.label ? <Tag tone={tone}>{u.label}</Tag> : <Tag tone={tone}>{STATUS_LABEL[o.status]}</Tag>}
                      </button>
                      {open && (
                        <button
                          type="button"
                          className="icon-btn kal-done"
                          aria-label={`Tandai ${o.title} selesai`}
                          title="Tandai selesai"
                          onClick={() => void setOrderStatus(o, 'done')}
                        >
                          <Check size={18} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ===== Jendela ubah ===== */}
      {modal?.type === 'hours' && <HoursModal hours={hours} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.type === 'day' && (
        <DayStatusModal
          date={selected}
          weekly={weeklyInfo(selected, hours)}
          override={selOverride}
          shiftCount={selShifts.length}
          orderCount={selOrders.length}
          onClose={() => setModal(null)}
          onSaved={done}
        />
      )}
      {modal?.type === 'orderView' && (
        <OrderDetailModal
          order={modal.order}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ type: 'order', order: modal.order })}
          onDone={() => {
            void setOrderStatus(modal.order, 'done')
            setModal(null)
          }}
        />
      )}
      {modal?.type === 'order' && (
        <OrderModal order={modal.order} canDelete={isAdmin} onClose={() => setModal(null)} onSaved={done} />
      )}
    </div>
  )
}

