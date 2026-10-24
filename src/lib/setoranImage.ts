import { rupiah } from './format'

export interface SetoranImageInput {
  appName: string
  tagline: string
  supplierName: string
  dateLabel: string
  rows: { name: string; kind: string; qty: number; unitCost: number; subtotal: number }[]
  payable: number
  paid: number
  payments: { amount: number; when: string; by: string }[]
  /** Catatan promo untuk supplier (satu kalimat per baris, akan dipotong otomatis bila panjang). */
  promoNotes?: string[]
  generatedAt: string
  logoUrl?: string | null
}

const FONT = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif'
const C = {
  text: '#13202b',
  muted: '#667085',
  border: '#e4ebe7',
  soft: '#f1f5f3',
  primary: '#087f58',
  primarySoft: '#e3f5ed',
  danger: '#d92d20',
  dangerSoft: '#fde8e6',
  warning: '#b45309',
  warningSoft: '#fef0d9',
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text
  let s = text
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1)
  return `${s}…`
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxW) {
      out.push(line)
      line = word
    } else line = next
  }
  if (line) out.push(line)
  return out
}

function statusOf(payable: number, paid: number) {
  if (payable === 0 && paid === 0) return { text: 'TIDAK ADA TAGIHAN', fg: C.muted, bg: C.border }
  if (paid === 0) return { text: 'BELUM DIBAYAR', fg: C.danger, bg: C.dangerSoft }
  if (paid < payable) return { text: 'KURANG BAYAR', fg: C.warning, bg: C.warningSoft }
  if (paid === payable) return { text: 'LUNAS', fg: C.primary, bg: C.primarySoft }
  return { text: 'LEBIH BAYAR', fg: C.warning, bg: C.warningSoft }
}

   function loadImage(url: string): Promise<HTMLImageElement | null> {
     return new Promise((resolve) => {
       const img = new Image()
       img.crossOrigin = 'anonymous'
       img.onload = () => resolve(img)
       img.onerror = () => resolve(null)
       setTimeout(() => resolve(null), 4000)
       img.src = url
     })
   }

export async function renderSetoranImage(inp: SetoranImageInput): Promise<Blob> {
  try {
    await Promise.all(['400', '500', '600', '700', '800'].map((w) => document.fonts.load(`${w} 14px "Plus Jakarta Sans"`)))
  } catch {
    /* pakai font cadangan */
  }

  const logo = inp.logoUrl ? await loadImage(inp.logoUrl) : null
  const W = 720
  const P = 32
  const SCALE = 2
  const ROW = 34
  const BOX = 144
  const list = inp.rows
  const rowsH = Math.max(list.length, 1) * ROW
  const payExtra = inp.payments.length > 0 ? 36 + inp.payments.length * 22 : 0

  // catatan promo: dipecah per baris dulu supaya tinggi gambar bisa dihitung
  const NOTE_LH = 19
  const measure = document.createElement('canvas').getContext('2d')
  let noteLines: string[] = []
  if (measure && inp.promoNotes && inp.promoNotes.length > 0) {
    measure.font = `500 12.5px ${FONT}`
    noteLines = inp.promoNotes.flatMap((t) => wrapText(measure, t, W - 2 * P - 28))
  }
  const noteExtra = noteLines.length > 0 ? 56 + noteLines.length * NOTE_LH : 0

  const H = 216 + rowsH + 20 + BOX + payExtra + noteExtra + 60

  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Gagal membuat gambar')
  ctx.scale(SCALE, SCALE)
  ctx.textBaseline = 'alphabetic'
  const font = (w: number, s: number) => `${w} ${s}px ${FONT}`

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // ---- kepala ----
       if (logo) {
       ctx.save()
       roundRect(ctx, P, 32, 44, 44, 12)
       ctx.clip()
       const s = Math.min(44 / logo.width, 44 / logo.height)
       ctx.drawImage(logo, P + (44 - logo.width * s) / 2, 32 + (44 - logo.height * s) / 2, logo.width * s, logo.height * s)
       ctx.restore()
     } else {
       ctx.fillStyle = C.primary
       roundRect(ctx, P, 32, 44, 44, 12)
       ctx.fill()
       ctx.fillStyle = '#ffffff'
       ctx.font = font(800, 22)
       ctx.textAlign = 'center'
       ctx.fillText(inp.appName.charAt(0).toUpperCase(), P + 22, 62)
     }

  ctx.textAlign = 'left'
  ctx.fillStyle = C.text
  ctx.font = font(800, 20)
  ctx.fillText(inp.appName, P + 58, 53)
  ctx.fillStyle = C.muted
  ctx.font = font(500, 12)
  ctx.fillText(inp.tagline, P + 58, 71)

  ctx.textAlign = 'right'
  ctx.fillStyle = C.primary
  ctx.font = font(800, 12)
  ctx.fillText('REKAP SETORAN', W - P, 52)
  ctx.fillStyle = C.muted
  ctx.font = font(500, 12)
  ctx.fillText(inp.dateLabel, W - P, 71)

  ctx.fillStyle = C.border
  ctx.fillRect(P, 96, W - 2 * P, 1)

  // ---- penerima ----
  ctx.textAlign = 'left'
  ctx.fillStyle = C.muted
  ctx.font = font(600, 12)
  ctx.fillText('KEPADA', P, 126)
  ctx.fillStyle = C.text
  ctx.font = font(800, 24)
  ctx.fillText(fit(ctx, inp.supplierName, W - 2 * P), P, 156)

  // ---- tabel ----
  const colQty = 410
  const colPrice = 540
  const colSub = W - P - 14
  ctx.fillStyle = C.soft
  roundRect(ctx, P, 180, W - 2 * P, 36, 10)
  ctx.fill()
  ctx.fillStyle = C.muted
  ctx.font = font(700, 11)
  ctx.textAlign = 'left'
  ctx.fillText('PRODUK', P + 14, 203)
  ctx.textAlign = 'right'
  ctx.fillText('JML', colQty, 203)
  ctx.fillText('HARGA', colPrice, 203)
  ctx.fillText('SUBTOTAL', colSub, 203)

  let y = 216
  if (list.length === 0) {
    ctx.textAlign = 'left'
    ctx.fillStyle = C.muted
    ctx.font = font(500, 14)
    ctx.fillText('Tidak ada barang terjual pada tanggal ini.', P + 14, y + 22)
    y += ROW
  }
  for (const r of list) {
    const rusak = r.kind.startsWith('rusak')
    ctx.textAlign = 'left'
    ctx.font = font(600, 14)
    ctx.fillStyle = C.text
    const label = rusak ? `${r.name} (rusak, ditanggung toko)` : r.name
    ctx.fillText(fit(ctx, label, colQty - 50 - (P + 14)), P + 14, y + 22)
    ctx.textAlign = 'right'
    ctx.fillStyle = rusak ? C.warning : C.text
    ctx.font = font(500, 14)
    ctx.fillText(String(r.qty), colQty, y + 22)
    ctx.fillText(rupiah(r.unitCost), colPrice, y + 22)
    ctx.font = font(700, 14)
    ctx.fillText(rupiah(r.subtotal), colSub, y + 22)
    ctx.fillStyle = C.border
    ctx.fillRect(P, y + ROW - 1, W - 2 * P, 1)
    y += ROW
  }

  // ---- total ----
  y += 20
  const rest = Math.max(inp.payable - inp.paid, 0)
  const right = W - P - 18
  ctx.fillStyle = C.soft
  roundRect(ctx, P, y, W - 2 * P, BOX, 14)
  ctx.fill()

  const line = (label: string, value: string, yy: number, bold: boolean, color: string) => {
    ctx.textAlign = 'left'
    ctx.fillStyle = C.muted
    ctx.font = font(600, 14)
    ctx.fillText(label, P + 18, yy)
    ctx.textAlign = 'right'
    ctx.fillStyle = color
    ctx.font = font(bold ? 800 : 600, bold ? 18 : 15)
    ctx.fillText(value, right, yy)
  }
  line('Total tagihan', rupiah(inp.payable), y + 36, true, C.text)
  line('Sudah dibayar', rupiah(inp.paid), y + 66, false, C.text)
  line('Sisa tagihan', rupiah(rest), y + 98, true, rest > 0 ? C.danger : C.primary)

  const st = statusOf(inp.payable, inp.paid)
  ctx.textAlign = 'left'
  ctx.fillStyle = C.muted
  ctx.font = font(600, 14)
  ctx.fillText('Status', P + 18, y + 127)
  ctx.font = font(800, 12)
  const pw = ctx.measureText(st.text).width + 24
  ctx.fillStyle = st.bg
  roundRect(ctx, right - pw, y + 110, pw, 24, 12)
  ctx.fill()
  ctx.fillStyle = st.fg
  ctx.textAlign = 'center'
  ctx.fillText(st.text, right - pw / 2, y + 127)
  y += BOX

  // ---- riwayat pembayaran ----
  if (inp.payments.length > 0) {
    y += 22
    ctx.textAlign = 'left'
    ctx.fillStyle = C.muted
    ctx.font = font(700, 11)
    ctx.fillText('RIWAYAT PEMBAYARAN', P, y)
    y += 14
    for (const p of inp.payments) {
      y += 22
      ctx.fillStyle = C.text
      ctx.font = font(500, 12.5)
      ctx.fillText(fit(ctx, `${rupiah(p.amount)}  ·  ${p.when}  ·  oleh ${p.by}`, W - 2 * P), P, y)
    }
  }

  // ---- catatan promo ----
  if (noteLines.length > 0) {
    y += 22
    const boxH = 34 + noteLines.length * NOTE_LH
    ctx.fillStyle = C.warningSoft
    roundRect(ctx, P, y, W - 2 * P, boxH, 12)
    ctx.fill()
    ctx.textAlign = 'left'
    ctx.fillStyle = C.warning
    ctx.font = font(800, 11)
    ctx.fillText('CATATAN PROMO', P + 14, y + 20)
    ctx.fillStyle = C.text
    ctx.font = font(500, 12.5)
    noteLines.forEach((t, i) => ctx.fillText(t, P + 14, y + 40 + i * NOTE_LH))
    y += boxH
  }

  // ---- kaki ----
  ctx.textAlign = 'center'
  ctx.fillStyle = C.muted
  ctx.font = font(500, 11)
  ctx.fillText(`Dibuat otomatis oleh ${inp.appName}  ·  ${inp.generatedAt}`, W / 2, y + 34)

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal membuat gambar'))), 'image/png'),
  )
}