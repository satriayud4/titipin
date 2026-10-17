import type { ReactNode } from 'react'
import { APP_BRAND, APP_BRAND_TAGLINE } from '../brand'
import BrandMark from './BrandMark'
import { ShopScene } from './Illustration'
import ThemeToggle from './ThemeToggle'

interface Props {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

export default function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="auth">
      <div className="auth-form">
        <div className="auth-top"><ThemeToggle /></div>
        <div className="auth-card page">
          <div className="auth-brand">
            <BrandMark fixed size={22} />
            <span className="brand-text">
              <span className="brand-name">{APP_BRAND}</span>
              <span className="brand-sub">{APP_BRAND_TAGLINE}</span>
            </span>
          </div>
          <h1>{title}</h1>
          {subtitle && <p className="page-sub" style={{ margin: '0 0 20px' }}>{subtitle}</p>}
          {children}
          {footer && <p className="auth-foot">{footer}</p>}
        </div>
      </div>
      <div className="auth-art">
        <div>
          <ShopScene className="auth-ill" />
          <h2>Kelola toko lebih rapi</h2>
          <p className="page-sub">Stok titipan, kasir, setoran supplier, dan laporan dalam satu aplikasi.</p>
        </div>
      </div>
    </div>
  )
}