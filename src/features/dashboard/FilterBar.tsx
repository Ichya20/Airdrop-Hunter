import { useId } from 'react'
import { Icon } from '../../components/Icon'
import { LABEL_ICON } from '../../components/labelIcons'
import { getNetwork } from '../../domain/networks'
import { LABEL_META, LABEL_ORDER } from '../../domain/status'
import {
  SORT_OPTIONS,
  type Filters,
  type LabelFilter,
  type NetworkOption,
  type SortKey,
} from './filtering'

interface FilterBarProps {
  filters: Filters
  onChange: (next: Filters) => void
  counts: Record<LabelFilter, number>
  networks: readonly NetworkOption[]
}

const STATUS_VALUES: readonly LabelFilter[] = ['all', ...LABEL_ORDER]

export function FilterBar({ filters, onChange, counts, networks }: FilterBarProps) {
  const id = useId()
  const options = [...networks]
  if (filters.chainId !== 'all' && !options.some((option) => option.chainId === filters.chainId)) {
    const network = getNetwork(filters.chainId)
    options.push({ chainId: network.chainId, name: network.name, testnet: network.testnet, count: 0 })
  }

  return (
    <div className="filters">
      <div className="filters__row" role="search" aria-label="Cari dan saring campaign">
        <div className="field field--grow">
          <label htmlFor={`${id}-query`} className="field__label">
            Cari nama
          </label>
          <div className="input-wrap">
            <Icon name="search" className="input-wrap__icon" />
            <input
              id={`${id}-query`}
              className="input input--search"
              type="search"
              value={filters.query}
              onChange={(event) => onChange({ ...filters, query: event.target.value })}
              placeholder="Nama campaign atau proyek"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            {filters.query !== '' ? (
              <button
                type="button"
                className="icon-btn icon-btn--sm input-wrap__clear"
                aria-label="Hapus pencarian"
                onClick={() => onChange({ ...filters, query: '' })}
              >
                <Icon name="close" size={16} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${id}-network`} className="field__label">
            Jaringan
          </label>
          <select
            id={`${id}-network`}
            className="select"
            value={String(filters.chainId)}
            onChange={(event) =>
              onChange({
                ...filters,
                chainId: event.target.value === 'all' ? 'all' : Number(event.target.value),
              })
            }
          >
            <option value="all">Semua</option>
            {options.map((option) => (
              <option key={option.chainId} value={String(option.chainId)}>
                {option.name}
                {option.testnet ? ' (testnet)' : ''} · {option.count}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={`${id}-sort`} className="field__label">
            Urutkan
          </label>
          <select
            id={`${id}-sort`}
            className="select"
            value={filters.sort}
            onChange={(event) => onChange({ ...filters, sort: event.target.value as SortKey })}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.text}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="chips">
        <legend className="sr-only">Filter status untuk wallet</legend>
        {STATUS_VALUES.filter((value) => value === 'all' || value === filters.label || counts[value] > 0).map((value) => {
          const checked = filters.label === value
          const tone = value === 'all' ? 'all' : LABEL_META[value].tone
          return (
            <label key={value} className={`chip chip--${tone}${checked ? ' chip--checked' : ''}`}>
              <input
                type="radio"
                className="chip__input"
                name={`${id}-status`}
                value={value}
                checked={checked}
                onChange={() => onChange({ ...filters, label: value })}
              />
              {value === 'all' ? null : <Icon name={LABEL_ICON[value]} size={14} />}
              <span>{value === 'all' ? 'Semua' : LABEL_META[value].text}</span>
              <span className="chip__count">{counts[value]}</span>
            </label>
          )
        })}
      </fieldset>
    </div>
  )
}
