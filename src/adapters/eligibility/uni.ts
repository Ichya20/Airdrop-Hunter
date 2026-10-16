import { concatHex, createPublicClient, encodePacked, http, isAddress, keccak256, type Hex } from 'viem'
import { mainnet } from 'viem/chains'
import type { EligibilityResult, HexAddress } from '../../domain/types'
import type { EligibilityAdapter } from './types'

import { UNI_DISTRIBUTOR, UNI_ELIGIBILITY_RULE, UNI_ELIGIBILITY_SOURCE, UNI_TOKEN, supportsUniEligibility } from './uniMetadata'
export { UNI_CAMPAIGN_ID, UNI_DISTRIBUTOR, UNI_ELIGIBILITY_RULE, UNI_ELIGIBILITY_SOURCE, UNI_TOKEN, supportsUniEligibility } from './uniMetadata'

const REQUEST_TIMEOUT_MS = 8_000
const MAX_PROOF_BYTES = 32 * 1024
const UINT256_MAX = (1n << 256n) - 1n
const BYTES32 = /^0x[0-9a-fA-F]{64}$/

const DISTRIBUTOR_ABI = [
  { type: 'function', name: 'merkleRoot', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'token', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'isClaimed', stateMutability: 'view', inputs: [{ name: 'index', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const

interface UniProof {
  index: bigint
  amount: bigint
  proof: Hex[]
}

export interface UniDistributorState {
  chainId: number
  blockNumber: bigint
  merkleRoot: Hex
  token: HexAddress
  isClaimed: boolean
}

export interface UniEligibilityDependencies {
  readState(input: { index: bigint; signal: AbortSignal }): Promise<UniDistributorState>
  now(): number
}

function parseUint256(value: unknown, allowNumber: boolean): bigint | null {
  if (allowNumber && typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null
  }
  if (typeof value !== 'string' || value.length === 0 || value.length > 78) return null
  if (!(allowNumber ? /^(0|[1-9][0-9]*)$/ : /^(0x[0-9a-fA-F]+|[0-9]+)$/).test(value)) return null
  const integer = BigInt(value)
  return integer <= UINT256_MAX ? integer : null
}

function parseProof(json: string, address: HexAddress): UniProof | null {
  if (json.length > MAX_PROOF_BYTES || new TextEncoder().encode(json).byteLength > MAX_PROOF_BYTES) return null
  let input: unknown
  try {
    input = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  const fields = Object.keys(record)
  if (fields.length !== 4 || !['address', 'index', 'amount', 'proof'].every((field) => fields.includes(field))) return null
  if (typeof record.address !== 'string' || !isAddress(record.address, { strict: false })) return null
  if (record.address.toLowerCase() !== address.toLowerCase()) return null
  const index = parseUint256(record.index, true)
  const amount = parseUint256(record.amount, false)
  if (index === null || amount === null || !Array.isArray(record.proof) || record.proof.length > 64) return null
  if (!record.proof.every((item) => typeof item === 'string' && BYTES32.test(item))) return null
  return { index, amount, proof: record.proof as Hex[] }
}

function proofRoot(address: HexAddress, proof: UniProof): Hex {
  let node = keccak256(encodePacked(['uint256', 'address', 'uint256'], [proof.index, address, proof.amount]))
  for (const sibling of proof.proof) {
    const pair = node.toLowerCase() < sibling.toLowerCase() ? [node, sibling] : [sibling, node]
    node = keccak256(concatHex(pair))
  }
  return node
}

async function readUniState({ index, signal }: { index: bigint; signal: AbortSignal }): Promise<UniDistributorState> {
  const client = createPublicClient({
    chain: mainnet,
    ccipRead: false,
    transport: http(undefined, {
      timeout: REQUEST_TIMEOUT_MS,
      retryCount: 0,
      fetchOptions: { signal },
      maxResponseBodySize: 16 * 1024,
    }),
  })
  const chainId = await client.getChainId()
  if (chainId !== 1) throw new Error('Wrong RPC chain')
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 })
  // Satu blok yang sama mencegah root dan status klaim tercampur antarblok.
  const contract = { address: UNI_DISTRIBUTOR, abi: DISTRIBUTOR_ABI, blockNumber } as const
  const [merkleRoot, token, isClaimed] = await Promise.all([
    client.readContract({ ...contract, functionName: 'merkleRoot' }),
    client.readContract({ ...contract, functionName: 'token' }),
    client.readContract({ ...contract, functionName: 'isClaimed', args: [index] }),
  ])
  return { chainId, blockNumber, merkleRoot, token, isClaimed }
}

/** Tidak memanggil wallet, meminta tanda tangan, atau mengirim transaksi. */
export function createUniEligibilityAdapter(overrides: Partial<UniEligibilityDependencies> = {}): EligibilityAdapter {
  const dependencies: UniEligibilityDependencies = { readState: readUniState, now: Date.now, ...overrides }
  return {
    rule: UNI_ELIGIBILITY_RULE,
    source: UNI_ELIGIBILITY_SOURCE,
    supports: supportsUniEligibility,
    async checkEligibility(campaign, identity, options = {}) {
      const checkedAt = new Date(dependencies.now()).toISOString()
      const result = (status: EligibilityResult['status'], reason: string, source = UNI_ELIGIBILITY_SOURCE): EligibilityResult => ({
        status, reason, source, checkedAt, rule: UNI_ELIGIBILITY_RULE,
      })
      if (!supportsUniEligibility(campaign)) {
        return result('unknown', 'Campaign ini tidak didukung adapter UNI Ethereum resmi.')
      }
      if (identity.kind !== 'watch' && identity.kind !== 'metamask') {
        return result('unknown', 'Pilih alamat publik atau hubungkan MetaMask untuk memeriksa eligibility UNI.')
      }
      if (!isAddress(identity.address, { strict: false }) || (identity.kind === 'metamask' && identity.chainId !== 1)) {
        return result('unknown', 'Eligibility UNI memerlukan alamat valid pada Ethereum Mainnet (chain ID 1).')
      }
      if (options.signal?.aborted) return result('unknown', 'Pemeriksaan eligibility dibatalkan.')
      if (!options.proofJson?.trim()) {
        return result('unknown', 'Masukkan JSON proof publik UNI untuk alamat aktif. Tanpa proof, eligibility belum dapat ditentukan.')
      }
      const proof = parseProof(options.proofJson, identity.address)
      if (!proof) {
        return result('unknown', 'JSON proof tidak valid atau alamat berbeda. Gunakan hanya address, index, amount, dan proof (maksimal 32 KB).')
      }

      const controller = new AbortController()
      const onAbort = () => controller.abort()
      options.signal?.addEventListener('abort', onAbort, { once: true })
      let timedOut = false
      const timeout = setTimeout(() => { timedOut = true; controller.abort() }, REQUEST_TIMEOUT_MS)
      let rejectAborted: (() => void) | undefined
      const aborted = new Promise<never>((_resolve, reject) => {
        rejectAborted = () => reject(new Error('Eligibility request aborted'))
        controller.signal.addEventListener('abort', rejectAborted, { once: true })
      })
      try {
        const state = await Promise.race([
          dependencies.readState({ index: proof.index, signal: controller.signal }),
          aborted,
        ])
        if (controller.signal.aborted) return result('unknown', 'Pemeriksaan eligibility dibatalkan.')
        if (state.chainId !== 1 || typeof state.blockNumber !== 'bigint' || state.blockNumber < 0n ||
          !BYTES32.test(state.merkleRoot) || typeof state.token !== 'string' ||
          state.token.toLowerCase() !== UNI_TOKEN.toLowerCase() || typeof state.isClaimed !== 'boolean') {
          return result('unknown', 'Respons kontrak UNI atau jaringan RPC tidak sesuai sumber resmi.')
        }
        const source = `${UNI_ELIGIBILITY_SOURCE} | blok ${state.blockNumber}`
        if (proofRoot(identity.address, proof).toLowerCase() !== state.merkleRoot.toLowerCase()) {
          return result('unknown', 'Proof tidak cocok dengan Merkle root kontrak UNI resmi; eligibility belum dapat ditentukan.', source)
        }
        if (state.isClaimed) {
          return result('ineligible', 'Proof UNI valid, tetapi alokasi pada index ini sudah diklaim menurut kontrak. Ini bukan konfirmasi transaksi aplikasi.', source)
        }
        return result('eligible', 'Proof UNI valid dan alokasi belum diklaim pada blok pemeriksaan. Arsip tetap nonaktif; transaksi klaim belum tersedia.', source)
      } catch {
        return result('unknown', timedOut
          ? 'Pemeriksaan eligibility melewati batas waktu 8 detik. Coba lagi.'
          : controller.signal.aborted
            ? 'Pemeriksaan eligibility dibatalkan.'
            : 'Sumber RPC atau kontrak UNI tidak dapat dibaca. Eligibility belum dapat ditentukan.')
      } finally {
        clearTimeout(timeout)
        options.signal?.removeEventListener('abort', onAbort)
        if (rejectAborted) controller.signal.removeEventListener('abort', rejectAborted)
        controller.abort()
      }
    },
  }
}
