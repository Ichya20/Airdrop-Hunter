import { UNI_CAMPAIGN_ID, UNI_DISTRIBUTOR, UNI_TOKEN } from '../../adapters/eligibility/uni'
import { isMarketEvidenceFresh, marketTokenKey, type TokenMarketEvidence } from '../../adapters/market'
import type { Campaign, HexAddress } from '../../domain/types'

/** A claim distributor address is never used as a reward token address. */
export function campaignRewardToken(campaign: Campaign): HexAddress | null {
  return campaign.origin === 'live' && campaign.id === UNI_CAMPAIGN_ID && campaign.chainId === 1
    && campaign.contract?.chainId === 1
    && campaign.contract.address.toLowerCase() === UNI_DISTRIBUTOR.toLowerCase()
    ? UNI_TOKEN : null
}

export function campaignMarket(
  campaign: Campaign,
  markets?: ReadonlyMap<string, TokenMarketEvidence>,
): TokenMarketEvidence | null {
  const token = campaignRewardToken(campaign)
  const evidence = token ? markets?.get(marketTokenKey(campaign.chainId, token)) : null
  return token && evidence?.chainId === campaign.chainId
    && evidence.tokenAddress.toLowerCase() === token.toLowerCase() ? evidence : null
}

export function hasCampaignMarket(campaign: Campaign, evidence: TokenMarketEvidence | null, now: number): boolean {
  const token = campaignRewardToken(campaign)
  return !!token && !!evidence && evidence.chainId === campaign.chainId
    && evidence.tokenAddress.toLowerCase() === token.toLowerCase() && isMarketEvidenceFresh(evidence, now)
}
