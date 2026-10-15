import type { Campaign, EligibilityResult, Identity } from '../../domain/types'

export interface EligibilityCheckOptions {
  /** Proof publik untuk alamat aktif; tidak disimpan oleh adapter. */
  proofJson?: string
  signal?: AbortSignal
}

export interface EligibilityAdapter {
  rule: string
  source: string
  supports(campaign: Campaign): boolean
  checkEligibility(
    campaign: Campaign,
    identity: Identity,
    options?: EligibilityCheckOptions,
  ): Promise<EligibilityResult>
}
