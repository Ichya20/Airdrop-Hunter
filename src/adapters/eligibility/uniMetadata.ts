import type { Campaign, HexAddress } from '../../domain/types'

export const UNI_ELIGIBILITY_RULE = 'uni-mainnet-merkle-1'
export const UNI_CAMPAIGN_ID = '1:uniswap:uniswap-governance-token-distribution-uni'
export const UNI_DISTRIBUTOR: HexAddress = '0x090D4613473dEE047c3f2706764f49E0821D256e'
export const UNI_TOKEN: HexAddress = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
export const UNI_ELIGIBILITY_SOURCE =
  `https://github.com/Uniswap/merkle-distributor | Ethereum (1) | distributor ${UNI_DISTRIBUTOR}`

export function supportsUniEligibility(campaign: Campaign): boolean {
  return campaign.origin === 'live' &&
    campaign.id === UNI_CAMPAIGN_ID &&
    campaign.chainId === 1 &&
    campaign.contract?.chainId === 1 &&
    typeof campaign.contract.address === 'string' &&
    campaign.contract.address.toLowerCase() === UNI_DISTRIBUTOR.toLowerCase()
}
