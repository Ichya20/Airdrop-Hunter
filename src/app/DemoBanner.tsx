import { useId } from 'react'
import { SOURCE_MODE_OPTIONS, type SourceMode } from '../adapters/sources'
import { Icon } from '../components/Icon'
import { DEMO_SCENARIOS, type DemoScenario } from '../demo/demoSources'

interface DemoBannerProps {
  sourceMode: SourceMode
  scenario: DemoScenario
  /** Layar sempit: pemilih sumber & skenario diringkas agar daftar campaign cepat terlihat. */
  compact: boolean
  onSourceModeChange: (mode: SourceMode) => void
  onScenarioChange: (scenario: DemoScenario) => void
}

export function DemoBanner({
  sourceMode,
  scenario,
  compact,
  onSourceModeChange,
  onScenarioChange,
}: DemoBannerProps) {
  const id = useId()
  const currentScenario = DEMO_SCENARIOS.find((option) => option.value === scenario)
  const currentMode = SOURCE_MODE_OPTIONS.find((option) => option.value === sourceMode)

  const control = (
    <>
      <div className="demo-banner__control">
        <label htmlFor={`${id}-mode`} className="field__label">
          Sumber data
        </label>
        <select
          id={`${id}-mode`}
          className="select select--sm"
          value={sourceMode}
          onChange={(event) => onSourceModeChange(event.target.value as SourceMode)}
        >
          {SOURCE_MODE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {sourceMode !== 'live' ? (
          <>
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
          </>
        ) : null}
      </div>
      <p id={`${id}-scenario-hint`} className="demo-banner__hint">
        {sourceMode === 'live'
          ? currentMode?.hint
          : `${currentMode?.hint ?? ''} ${currentScenario?.hint ?? ''} Berlaku pada scan berikutnya.`}
      </p>
    </>
  )

  return (
    <aside className={`demo-banner${compact ? ' demo-banner--compact' : ''}`} aria-label="Pengaturan sumber data Live dan DEMO">
      <p className="demo-banner__text">
        <span className="origin origin--live">LIVE</span>
        {sourceMode !== 'live' ? (
          <span className="origin origin--demo">
            <Icon name="flask" size={12} />
            DEMO
          </span>
        ) : null}
        <span>
          <strong>Tahap 3 aktif:</strong> sumber live publik <code>api.llama.fi/protocols</code> + arsip resmi proyek
          dipindai langsung dari browser dengan pembatasan laju (rate limit) dan pembaruan berbasis TTL 60 menit. Asal
          data <strong>LIVE</strong> dan <strong>DEMO</strong> selalu diberi label terpisah.
        </span>
      </p>
      {compact ? (
        <details className="demo-banner__more">
          <summary className="demo-banner__summary">
            <Icon name="chevronDown" size={16} className="demo-banner__chevron" />
            Sumber: <strong>{currentMode?.label}</strong>
            {sourceMode !== 'live' ? (
              <>
                {' '}
                · Skenario: <strong>{currentScenario?.label}</strong>
              </>
            ) : null}
          </summary>
          {control}
        </details>
      ) : (
        control
      )}
    </aside>
  )
}
