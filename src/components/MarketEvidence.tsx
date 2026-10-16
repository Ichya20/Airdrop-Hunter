import { isMarketEvidenceFresh, type TokenMarketEvidence } from '../adapters/market'
import { formatDateTime } from '../domain/format'

export function MarketEvidence({ evidence, now }: { evidence: TokenMarketEvidence | null; now: number }) {
  if (!evidence || !isMarketEvidenceFresh(evidence, now)) {
    return <span className="muted">{evidence?.status === 'unknown' ? evidence.reason : 'Harga dan likuiditas belum tersedia atau sudah usang.'}</span>
  }
  const usd = (value: number) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumSignificantDigits: 6,
  }).format(value)
  return <>
    <strong>{usd(Number(evidence.priceUsd))} / token</strong>
    <small>Likuiditas pool {usd(evidence.liquidityUsd!)}</small>
    <small>Diperiksa {formatDateTime(evidence.checkedAt!)}</small>
    <a href={evidence.sourceUrl!} target="_blank" rel="noopener noreferrer">Pasar di DEX Screener</a>
  </>
}
