/** Tanda AirdropHunter: reticle pemindai dengan tetesan di tengah. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      className="logo-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="16" r="10.5" stroke="currentColor" strokeWidth="2" opacity="0.9" />
      <path
        d="M16 2.5v5M16 24.5v5M2.5 16h5M24.5 16h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16 10.4c2.5 2.9 3.8 5 3.8 6.6a3.8 3.8 0 0 1-7.6 0c0-1.6 1.3-3.7 3.8-6.6Z"
        fill="currentColor"
      />
    </svg>
  )
}
