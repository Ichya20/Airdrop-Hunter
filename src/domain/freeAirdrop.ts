import { isMarketEvidenceFresh, type TokenMarketEvidence } from '../adapters/market'
import type { WalletReward } from '../adapters/rewards/merkl'
import * as evmChains from 'viem/chains'

export interface FreeRewardAssessment {
  status: 'market_candidate' | 'not_qualifying' | 'unknown'
  reason: string
}

type RewardCandidate = Pick<WalletReward, 'chainId' | 'tokenAddress' | 'assetType' | 'isTest' | 'claimable'>
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const UINT256_MAX = (1n << 256n) - 1n
const TESTNET_IDS = new Set<number>()
for (const chain of Object.values(evmChains)) {
  if (typeof chain === 'object' && chain !== null && 'id' in chain && typeof chain.id === 'number'
    && 'testnet' in chain && chain.testnet === true) TESTNET_IDS.add(chain.id)
}

export function isRewardTestnet(chainId: number): boolean {
  return TESTNET_IDS.has(chainId)
}

/** Laporan reward Merkl dan bukti pasar belum membuktikan receipt atau saldo wallet. */
export function assessFreeReward(
  reward: RewardCandidate,
  market?: TokenMarketEvidence | null,
  now = Date.now(),
): FreeRewardAssessment {
  if (reward.isTest || isRewardTestnet(reward.chainId) || reward.assetType === 'POINT' || reward.assetType === 'PRETGE') {
    return {
      status: 'not_qualifying',
      reason: 'Token uji, poin, dan aset pre-TGE belum memenuhi syarat token nyata yang dapat diklaim ke wallet dan memiliki pasar.',
    }
  }

  if (reward.assetType !== 'TOKEN' || !Number.isSafeInteger(reward.chainId) || reward.chainId < 1 ||
    typeof reward.tokenAddress !== 'string' || !ADDRESS.test(reward.tokenAddress) ||
    typeof reward.claimable !== 'string' || !/^(0|[1-9][0-9]*)$/.test(reward.claimable) || reward.claimable.length > 78) {
    return { status: 'unknown', reason: 'Identitas token atau jumlah reward tidak valid; hak klaim belum dapat dipastikan.' }
  }
  const claimable = BigInt(reward.claimable)
  if (claimable > UINT256_MAX) {
    return { status: 'unknown', reason: 'Jumlah reward melampaui uint256; hak klaim belum dapat dipastikan.' }
  }
  if (claimable === 0n) {
    return { status: 'not_qualifying', reason: 'API Merkl tidak melaporkan jumlah token yang belum diklaim untuk entri ini.' }
  }

  if (!market || market.chainId !== reward.chainId ||
    typeof market.tokenAddress !== 'string' || market.tokenAddress.toLowerCase() !== reward.tokenAddress.toLowerCase() ||
    !isMarketEvidenceFresh(market, now)) {
    return {
      status: 'unknown',
      reason: 'Harga dan likuiditas pasar untuk alamat token pada jaringan ini belum tersedia, tidak cocok, atau sudah usang. Periksa sumber resmi.',
    }
  }

  return {
    status: 'market_candidate',
    reason: 'API Merkl melaporkan token belum diklaim dan data pasar menunjukkan harga serta likuiditas. Kandidat distribusi gratis; gas dapat dibayar pengguna. Periksa hak klaim di sumber resmi; ini belum bukti token masuk wallet atau jaminan dapat dijual.',
  }
}
