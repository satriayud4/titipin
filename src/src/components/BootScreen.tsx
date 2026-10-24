import { APP_BRAND } from '../brand'

// Layar loading awal. Markup dan gayanya sama persis dengan layar pembuka di index.html
// (class "boot"), jadi saat React mengambil alih tidak ada perubahan tampilan sama sekali.
export default function BootScreen() {
  return (
    <div className="boot" role="status" aria-label="Memuat">
      <b>S</b>
      <strong>{APP_BRAND}</strong>
      <span>Memuat…</span>
    </div>
  )
}