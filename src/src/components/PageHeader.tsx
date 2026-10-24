import type { ReactNode } from 'react'

export default function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-sub" style={{ margin: 0 }}>{subtitle}</p>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  )
}