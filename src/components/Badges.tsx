import type { NetworkInfo } from '../domain/networks'
import { LABEL_META, ORIGIN_TEXT } from '../domain/status'
import type { DashboardLabel, DataOrigin } from '../domain/types'
import { Icon, type IconName } from './Icon'
import { LABEL_ICON } from './labelIcons'

/** Label status dashboard: selalu ikon + teks, warna hanya pendukung. */
export function StatusBadge({ label, size = 'md' }: { label: DashboardLabel; size?: 'sm' | 'md' | 'lg' }) {
  const meta = LABEL_META[label]
  return (
    <span className={`status status--${meta.tone} status--${size}`}>
      <Icon name={LABEL_ICON[label]} size={size === 'lg' ? 18 : 15} />
      <span>{meta.text}</span>
    </span>
  )
}

const ORIGIN_ICON: Record<DataOrigin, IconName> = {
  demo: 'flask',
  testnet: 'flask',
  live: 'shield',
}

export function OriginBadge({ origin }: { origin: DataOrigin }) {
  return (
    <span className={`origin origin--${origin}`}>
      <Icon name={ORIGIN_ICON[origin]} size={12} />
      {ORIGIN_TEXT[origin]}
    </span>
  )
}

export function NetworkTag({ network, showChainId = false }: { network: NetworkInfo; showChainId?: boolean }) {
  return (
    <span className="net">
      <span className="net__dot" style={{ backgroundColor: network.color }} aria-hidden="true" />
      <span className="net__name">{network.name}</span>
      {network.testnet ? <span className="net__testnet">testnet</span> : null}
      {showChainId ? <span className="net__id mono">#{network.chainId}</span> : null}
    </span>
  )
}

function hueOf(text: string): number {
  let hash = 0
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

/** Tile inisial proyek. Dekoratif; nama proyek selalu tertulis di sampingnya. */
export function Monogram({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const hue = hueOf(name)
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
  return (
    <span
      className={`monogram monogram--${size}`}
      style={{
        backgroundColor: `hsl(${hue} 28% 20%)`,
        color: `hsl(${hue} 72% 80%)`,
        borderColor: `hsl(${hue} 30% 30%)`,
      }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}
