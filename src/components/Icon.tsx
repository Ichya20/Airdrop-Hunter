import type { ReactNode } from 'react'

export type IconName =
  | 'archive'
  | 'alert'
  | 'check'
  | 'checkCircle'
  | 'checkDouble'
  | 'chevronDown'
  | 'chevronLeft'
  | 'clock'
  | 'close'
  | 'copy'
  | 'external'
  | 'eye'
  | 'flask'
  | 'globe'
  | 'grid'
  | 'help'
  | 'info'
  | 'list'
  | 'logout'
  | 'radar'
  | 'refresh'
  | 'search'
  | 'send'
  | 'shield'
  | 'sparkle'
  | 'star'
  | 'starFilled'
  | 'stop'
  | 'wallet'
  | 'xCircle'

const STAR = 'm12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z'

const PATHS: Record<IconName, ReactNode> = {
  archive: (
    <>
      <rect x="3.5" y="4.5" width="17" height="4" rx="1" />
      <path d="M5 8.5v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-10M10 12.5h4" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 4.6 2.9 17.5a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4.2M12 17h.01" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.4 12.3 2.5 2.5 4.8-5.1" />
    </>
  ),
  checkDouble: <path d="m2.5 12.8 3.9 3.9 7.4-7.6M12.2 16l.7.7 8.6-8.6" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  external: (
    <>
      <path d="M14 4.5h5.5V10M19.5 4.5 11 13" />
      <path d="M18 14v4.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H10" />
    </>
  ),
  eye: (
    <>
      <path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  flask: (
    <>
      <path d="M9.5 3.5h5M10.5 3.5v5.2L5.3 18a1.5 1.5 0 0 0 1.3 2.3h10.8a1.5 1.5 0 0 0 1.3-2.3l-5.2-9.3V3.5" />
      <path d="M7.6 14.2h8.8" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5S9.7 5.9 12 3.5Z" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.7 9.5a2.4 2.4 0 1 1 3.4 2.2c-.7.3-1.1.9-1.1 1.6v.3M12 16.8h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.2M12 7.8h.01" />
    </>
  ),
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  logout: (
    <>
      <path d="M14 4.5h4A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-4" />
      <path d="M10 16.5 5.5 12 10 7.5M5.5 12H15" />
    </>
  ),
  radar: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12 18 6" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  send: <path d="M20.5 3.5 10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4Z" />,
  shield: (
    <>
      <path d="M12 3.5 19 6v5.6c0 4.3-2.9 7.6-7 8.9-4.1-1.3-7-4.6-7-8.9V6Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  sparkle: <path d="M12 3.5 13.9 10.1 20.5 12 13.9 13.9 12 20.5 10.1 13.9 3.5 12 10.1 10.1Z" />,
  star: <path d={STAR} />,
  starFilled: <path d={STAR} fill="currentColor" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  wallet: (
    <>
      <path d="M4.5 7.5h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2Z" />
      <path d="M4.5 7.5V6.8a2 2 0 0 1 1.7-2l9-1.3a1.5 1.5 0 0 1 1.8 1.5v2.5" />
      <path d="M16 13.5h.01" />
    </>
  ),
  xCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
    </>
  ),
}

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

/** Ikon dekoratif. Nama aksi selalu disediakan oleh teks atau `aria-label` pada kontrol. */
export function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
