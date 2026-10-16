import { useState } from 'react'
import { formatUnits } from 'viem'
import type { WalletReward } from '../../adapters/rewards/merkl'
import { marketTokenKey } from '../../adapters/market'
import { MarketEvidence } from '../../components/MarketEvidence'
import { Icon } from '../../components/Icon'
import { shortenAddress } from '../../domain/address'
import type { Identity } from '../../domain/types'
import { assessFreeReward, isRewardTestnet } from '../../domain/freeAirdrop'
import { identityAddress } from '../wallet/identity'
import type { useWalletRewards } from './useWalletRewards'

interface Props {
  identity: Identity
  rewards: ReturnType<typeof useWalletRewards>
  now: number
}

function assetName(reward: WalletReward): string {
  if (reward.isTest || isRewardTestnet(reward.chainId)) return 'Token uji · bukan reward live'
  if (reward.assetType === 'POINT') return 'Poin · bukan token wallet'
  if (reward.assetType === 'PRETGE') return 'Pre-TGE · belum token live'
  return reward.tokenVerified ? 'Token menurut Merkl' : 'Token belum diverifikasi Merkl'
}

export function WalletRewardsPanel({ identity, rewards, now }: Props) {
  const address = identityAddress(identity)
  const [expanded, setExpanded] = useState(false)
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rewards.rewards.length / 100))
  const currentPage = Math.min(page, pages - 1)
  const visible = expanded ? rewards.rewards.slice(currentPage * 100, (currentPage + 1) * 100) : []
  const marketFor = (reward: WalletReward) => {
    const evidence = rewards.markets.get(marketTokenKey(reward.chainId, reward.tokenAddress))
    return evidence?.chainId === reward.chainId && evidence.tokenAddress.toLowerCase() === reward.tokenAddress.toLowerCase() ? evidence : null
  }
  const candidates = rewards.rewards.filter((reward) => assessFreeReward(reward, marketFor(reward), now).status === 'market_candidate').length
  return (
    <section className="wallet-rewards" aria-labelledby="wallet-rewards-title" aria-busy={rewards.status === 'loading' || rewards.marketStatus === 'loading'}>
      <div className="wallet-rewards__heading">
        <h2 id="wallet-rewards-title">Reward per wallet · Merkl</h2>
        <button type="button" className="btn btn--secondary btn--sm" disabled={!address || rewards.status === 'loading'} onClick={() => { void rewards.refresh() }}>
          <Icon name="refresh" />{rewards.status === 'loading' ? 'Memeriksa…' : 'Periksa ulang'}
        </button>
      </div>
      <p>Data API Merkl dapat tertunda; belum memverifikasi kontrak atau token masuk wallet. Nilai pasar hanya indikasi, gas dapat diperlukan. Klaim dalam aplikasi belum aktif.</p>
      <div role="status" aria-live="polite">
        {!address ? <p>Pilih alamat pantau atau MetaMask untuk memeriksa reward.</p> : null}
        {address && rewards.status === 'idle' ? <p>Reward alamat ini belum diperiksa.</p> : null}
        {rewards.status === 'loading' ? <p>Memeriksa reward semua jaringan Merkl…</p> : null}
        {rewards.status === 'error' ? <p>{rewards.error} Hasil gagal tidak berarti saldo reward nol.</p> : null}
        {rewards.status === 'success' ? <p>{rewards.rewards.length} entri API · diperiksa {rewards.checkedAt ? new Date(rewards.checkedAt).toLocaleString('id-ID') : '—'}.</p> : null}
        {rewards.marketStatus === 'loading' ? <p>Memeriksa nilai pasar {rewards.marketCompleted} dari {rewards.marketTotal} token…</p> : null}
        {rewards.status === 'success' && rewards.rewards.length > 0 ? <p>{candidates} kandidat dengan jumlah belum diklaim serta harga dan likuiditas pasar segar. Periksa hak klaim di sumber resmi.</p> : null}
        {rewards.status === 'success' && rewards.rewards.length === 0 ? <p>Merkl tidak melaporkan reward untuk alamat ini; sumber lain belum tercakup.</p> : null}
      </div>
      {rewards.rewards.length > 0 ? <details className="wallet-rewards__entries" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>Tampilkan {rewards.rewards.length} entri reward wallet</summary>
        {expanded ? <div className="table-wrap wallet-rewards__table" tabIndex={0} role="region" aria-label="Reward wallet menurut API Merkl">
          <table className="ctable">
            <thead><tr><th scope="col">Aset / jaringan</th><th scope="col">Belum diklaim menurut API</th><th scope="col">Pending · belum bisa diklaim</th><th scope="col">Nilai pasar</th><th scope="col">Kriteria free</th><th scope="col">Gas</th></tr></thead>
            <tbody>{visible.map((reward) => {
              const evidence = marketFor(reward)
              const assessment = assessFreeReward(reward, evidence, now)
              return (
              <tr key={reward.id}>
                <th scope="row"><strong>{reward.symbol}</strong><small>{reward.chainName} ({reward.chainId}) · {assetName(reward)}</small><small title={reward.tokenAddress}>{shortenAddress(reward.tokenAddress)}</small></th>
                <td>{formatUnits(BigInt(reward.claimable), reward.decimals)}</td>
                <td>{formatUnits(BigInt(reward.pending), reward.decimals)}</td>
                <td><MarketEvidence evidence={evidence} now={now} /></td>
                <td><strong>{assessment.status === 'market_candidate' ? 'Kandidat bernilai' : assessment.status === 'not_qualifying' ? 'Belum memenuhi kriteria' : 'Belum terverifikasi'}</strong><small>{assessment.reason}</small></td>
                <td>Dibayar pengguna · boleh terpisah</td>
              </tr>
              )
            })}</tbody>
          </table>
        </div> : null}
      {expanded && pages > 1 ? <nav className="button-row" aria-label="Halaman reward wallet">
        <button type="button" className="btn btn--secondary btn--sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Sebelumnya</button>
        <span>Halaman {currentPage + 1} dari {pages} · seluruh {rewards.rewards.length} entri tersedia</span>
        <button type="button" className="btn btn--secondary btn--sm" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Berikutnya</button>
      </nav> : null}
      </details> : null}
      {address ? <a className="btn btn--ghost btn--sm" href={`https://app.merkl.xyz/users/${address}`} target="_blank" rel="noreferrer noopener">Buka dashboard resmi Merkl <Icon name="external" /></a> : null}
    </section>
  )
}
