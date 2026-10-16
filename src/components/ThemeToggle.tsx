import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'

const current = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem('theme', t)
  } catch {
    /* penyimpanan tidak tersedia, abaikan */
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#16110e' : '#faf6f1')
}

export default function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme>(current)

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  const label = theme === 'dark' ? 'Mode terang' : 'Mode gelap'
  return (
    <button type="button" className={withLabel ? 'btn-ghost' : 'icon-btn'} onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      {withLabel && <span style={{ marginLeft: 6 }}>{label}</span>}
    </button>
  )
}