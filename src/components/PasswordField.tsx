
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
}

export default function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
}: Props) {
  const [show, setShow] = useState(false)

  return (
    <div className="pw">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => {
          onChange(event.currentTarget.value)
        }}
      />

      <button
        type="button"
        className="icon-btn"
        onClick={() => setShow((previous) => !previous)}
        aria-label={
          show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'
        }
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
