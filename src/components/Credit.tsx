import { APP_BRAND, APP_CREATOR } from '../brand'

/** Pencantuman pembuat aplikasi. */
export default function Credit({ className = '' }: { className?: string }) {
  return (
    <p className={`credit ${className}`.trim()}>
      {APP_BRAND} dibuat oleh <strong>{APP_CREATOR}</strong>
    </p>
  )
}
