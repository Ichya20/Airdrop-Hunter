import type { DashboardLabel } from '../domain/types'
import type { IconName } from './Icon'

export const LABEL_ICON: Record<DashboardLabel, IconName> = {
  ready: 'checkCircle',
  unverified: 'help',
  opportunity: 'sparkle',
  ineligible: 'xCircle',
  claimed: 'checkDouble',
  ended: 'archive',
}
