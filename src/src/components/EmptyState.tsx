import type { ReactNode } from 'react'
import { EmptyBox } from './Illustration'

export default function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <EmptyBox className="empty-ill" />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}