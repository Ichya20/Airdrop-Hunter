import type { ActionKind } from '../../domain/status'

export type DetailView = 'info' | 'claim'
export type DetailFocus = 'title' | 'requirements' | 'tx'

export interface OpenIntent {
  view: DetailView
  focus: DetailFocus
}

export interface DetailRequest extends OpenIntent {
  campaignId: string
}

export const OPEN_DETAIL: OpenIntent = { view: 'info', focus: 'title' }

/** Aksi baris tabel/daftar selalu membuka detail pada bagian yang relevan. */
export function intentFor(kind: ActionKind): OpenIntent {
  switch (kind) {
    case 'claim':
      return { view: 'claim', focus: 'title' }
    case 'requirements':
      return { view: 'info', focus: 'requirements' }
    case 'tx':
      return { view: 'info', focus: 'tx' }
    case 'claim_site':
    case 'check':
    case 'reason':
    case 'archive':
      return OPEN_DETAIL
  }
}
