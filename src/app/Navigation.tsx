import { Icon, type IconName } from '../components/Icon'
import type { Scanner } from '../features/scanner/useScanner'
import { ScanButton } from './AppHeader'
import type { Route } from './hooks'

interface NavItem {
  route: Route
  href: string
  text: string
  icon: IconName
}

const NAV_ITEMS: readonly NavItem[] = [
  { route: 'dashboard', href: '#/', text: 'Dashboard', icon: 'grid' },
  { route: 'watchlist', href: '#/watchlist', text: 'Watchlist', icon: 'star' },
]

interface NavigationProps {
  route: Route
  counts: Record<Route, number>
}

export function Sidebar({ route, counts }: NavigationProps) {
  return (
    <nav className="sidebar" aria-label="Navigasi utama">
      <ul className="sidebar__list">
        {NAV_ITEMS.map((item) => (
          <li key={item.route}>
            <a
              className="sidebar__link"
              href={item.href}
              aria-current={route === item.route ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.text}</span>
              <span className="sidebar__count">{counts[item.route]}</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="sidebar__note">
        <p className="sidebar__note-title">
          <Icon name="flask" size={14} />
          Tahap 2 · Wallet &amp; IndexedDB
        </p>
        <p>Tanpa backend. Pengaturan, watchlist, dan hasil scan disimpan di IndexedDB per alamat + chain ID.</p>
        <p>Wallet: MetaMask Chrome extension di laptop. HP: mode pantau alamat publik.</p>
      </div>
    </nav>
  )
}

export function BottomBar({
  route,
  counts,
  scanner,
  onScan,
}: NavigationProps & { scanner: Scanner; onScan: () => void }) {
  const [dashboard, watchlist] = NAV_ITEMS
  const renderLink = (item: NavItem) => (
    <a
      className="bottombar__link"
      href={item.href}
      aria-current={route === item.route ? 'page' : undefined}
    >
      <Icon name={item.icon} />
      <span>{item.text}</span>
      {counts[item.route] > 0 ? <span className="bottombar__count">{counts[item.route]}</span> : null}
    </a>
  )
  return (
    <div className="bottombar">
      <nav className="bottombar__nav" aria-label="Navigasi utama">
        {renderLink(dashboard)}
        <ScanButton scanner={scanner} onScan={onScan} className="bottombar__cta" />
        {renderLink(watchlist)}
      </nav>
    </div>
  )
}
