import type { Campaign } from './types'

export interface ClaimCostAssessment {
  status: 'free_distribution' | 'unknown'
  gas: 'user_pays_gas' | 'unknown'
  reason: string
  sourceUrl: string | null
}

/** Biaya distribusi dipisahkan dari gas dan syarat eligibility per wallet. */
export function assessClaimCost(campaign: Campaign): ClaimCostAssessment {
  if (campaign.origin !== 'live') {
    return {
      status: 'unknown',
      gas: 'unknown',
      reason: 'Data demo atau testnet tidak membuktikan distribusi token nyata yang bernilai pasar.',
      sourceUrl: null,
    }
  }

  if (
    campaign.id === '1:uniswap:uniswap-governance-token-distribution-uni' &&
    campaign.chainId === 1 &&
    campaign.contract?.chainId === 1 &&
    campaign.contract.address.toLowerCase() === '0x090d4613473dee047c3f2706764f49e0821d256e'
  ) {
    return {
      status: 'free_distribution',
      gas: 'user_pays_gas',
      reason: 'Distribusi UNI tidak memungut biaya pembelian token; gas Ethereum dibayar pengirim. Syarat snapshot historis dan hak klaim wallet tetap perlu diverifikasi.',
      sourceUrl: 'https://github.com/Uniswap/merkle-distributor',
    }
  }

  const merklPrefix = `${campaign.chainId}:merkl:`
  let merklOfficialSite = false
  try {
    const url = new URL(campaign.officialUrl ?? '')
    merklOfficialSite = url.origin === 'https://app.merkl.xyz' && url.username === '' && url.password === ''
  } catch { /* URL yang tidak valid tidak membuktikan sumber resmi. */ }

  if (campaign.sourceKind === 'api' && campaign.foundIn.includes('merkl-catalog-live') &&
    campaign.id.startsWith(merklPrefix) && campaign.id.length > merklPrefix.length && merklOfficialSite) {
    return {
      status: 'free_distribution',
      gas: 'user_pays_gas',
      reason: 'Merkl tidak memungut biaya klaim dari penerima; gas tetap dibayar pengguna. Program dapat mensyaratkan aktivitas atau modal sebelumnya; periksa syarat resmi dan hak klaim wallet.',
      sourceUrl: 'https://app.merkl.fr/about',
    }
  }

  return {
    status: 'unknown',
    gas: 'unknown',
    reason: 'Biaya distribusi token belum diverifikasi. Teks gratis pada metadata tidak membuktikan hak klaim atau nilai pasar token.',
    sourceUrl: null,
  }
}
