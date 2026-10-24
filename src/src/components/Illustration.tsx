// Ilustrasi vector sederhana sebagai pengisi sementara. Warnanya mengikuti tema terang/gelap.
export function ShopScene({ className }: { className?: string }) {
  const line = { stroke: 'var(--text)', strokeWidth: 2.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  return (
    <svg viewBox="0 0 260 160" className={className} role="img" aria-label="Ilustrasi toko kue" fill="none">
      <circle cx="205" cy="64" r="44" style={{ fill: 'var(--primary-soft)' }} />
      <circle cx="46" cy="44" r="20" style={{ fill: 'var(--purple-soft)' }} />

      {/* meja */}
      <rect x="14" y="122" width="232" height="12" rx="6" {...line} style={{ fill: 'var(--primary)' }} />
      <path d="M36 134v16M224 134v16" {...line} />

      {/* kue bertingkat di atas dudukan */}
      <ellipse cx="100" cy="121" rx="18" ry="3.5" {...line} style={{ fill: 'var(--surface)' }} />
      <path d="M100 106v15" {...line} />
      <ellipse cx="100" cy="104" rx="46" ry="7" {...line} style={{ fill: 'var(--surface)' }} />
      <path d="M68 80h64v22a32 6 0 0 1-64 0z" {...line} style={{ fill: 'var(--warning-soft)' }} />
      <path d="M76 60h48v20H76z" {...line} style={{ fill: 'var(--primary-soft)' }} />
      <path d="M68 80c4 8 8 8 12 0s8 8 12 0 8 8 12 0 8 8 12 0 8 8 12 0" {...line} style={{ fill: 'var(--surface)' }} />
      <circle cx="100" cy="53" r="6" {...line} style={{ fill: 'var(--danger)' }} />
      <path d="M100 47c0-5 3-8 7-9" {...line} />

      {/* cupcake */}
      <path d="M170 122l3-22h24l3 22z" {...line} style={{ fill: 'var(--purple-soft)' }} />
      <ellipse cx="185" cy="98" rx="17" ry="8" {...line} style={{ fill: 'var(--surface)' }} />
      <ellipse cx="185" cy="89" rx="11" ry="6" {...line} style={{ fill: 'var(--surface)' }} />
      <circle cx="185" cy="80" r="4" {...line} style={{ fill: 'var(--danger)' }} />

      {/* tanaman */}
      <path d="M222 122v-18h22v18z" {...line} style={{ fill: 'var(--warning)' }} />
      <path d="M233 104c-10-10-11-22-3-32 8 10 10 22 3 32z" {...line} style={{ fill: 'var(--primary)' }} />
      <path d="M233 104c8-6 14-6 20-2-4 8-12 9-20 2z" {...line} style={{ fill: 'var(--primary)' }} />

      {/* kilau */}
      <path d="M36 80v10M31 85h10M150 38v10M145 43h10" {...line} />
    </svg>
  )
}

export function EmptyBox({ className }: { className?: string }) {
  const line = { stroke: 'var(--text)', strokeWidth: 2.2, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  return (
    <svg viewBox="0 0 200 140" className={className} role="img" aria-label="Ilustrasi data kosong" fill="none">
      <ellipse cx="100" cy="126" rx="62" ry="7" style={{ fill: 'var(--surface-2)' }} />
      <circle cx="100" cy="66" r="52" style={{ fill: 'var(--primary-soft)' }} />
      <path d="M48 68v36l52 20V88z" {...line} style={{ fill: 'var(--warning-soft)' }} />
      <path d="M152 68v36l-52 20V88z" {...line} style={{ fill: 'var(--warning-soft)' }} />
      <path d="M48 68l52 20 52-20-52-20z" {...line} style={{ fill: 'var(--surface)' }} />
      <path d="M48 68L26 52l50-18 24 14z" {...line} style={{ fill: 'var(--surface)' }} />
      <path d="M152 68l22-16-50-18-24 14z" {...line} style={{ fill: 'var(--surface)' }} />
      <path d="M100 88v36" {...line} />
      <path d="M40 30v10M35 35h10M164 22v10M159 27h10" {...line} />
    </svg>
  )
}