import { useId } from 'react'
import { Icon } from '../components/Icon'
import { DEMO_SCENARIOS, type DemoScenario } from '../demo/demoSources'

interface DemoBannerProps {
  scenario: DemoScenario
  /** Layar sempit: pemilih skenario diringkas agar daftar campaign cepat terlihat. */
  compact: boolean
  onScenarioChange: (scenario: DemoScenario) => void
}

export function DemoBanner({ scenario, compact, onScenarioChange }: DemoBannerProps) {
  const id = useId()
  const current = DEMO_SCENARIOS.find((option) => option.value === scenario)

  const control = (
    <>
      <div className="demo-banner__control">
        <label htmlFor={`${id}-scenario`} className="field__label">
          Skenario demo
        </label>
        <select
          id={`${id}-scenario`}
          className="select select--sm"
          value={scenario}
          aria-describedby={`${id}-scenario-hint`}
          onChange={(event) => onScenarioChange(event.target.value as DemoScenario)}
        >
          {DEMO_SCENARIOS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <p id={`${id}-scenario-hint`} className="demo-banner__hint">
        {current?.hint} Berlaku pada scan berikutnya.
      </p>
    </>
  )

  return (
    <aside className={`demo-banner${compact ? ' demo-banner--compact' : ''}`} aria-label="Keterangan data DEMO">
      <p className="demo-banner__text">
        <span className="origin origin--demo">
          <Icon name="flask" size={12} />
          DEMO
        </span>
        <span>
          Semua campaign adalah <strong>fixture lokal</strong>, bukan campaign nyata. Tanpa koneksi wallet, RPC, atau
          transaksi.
        </span>
      </p>
      {compact ? (
        <details className="demo-banner__more">
          <summary className="demo-banner__summary">
            <Icon name="chevronDown" size={16} className="demo-banner__chevron" />
            Skenario demo: <strong>{current?.label}</strong>
          </summary>
          {control}
        </details>
      ) : (
        control
      )}
    </aside>
  )
}
