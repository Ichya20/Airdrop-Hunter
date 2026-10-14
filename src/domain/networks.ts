export interface NetworkInfo {
  chainId: number
  name: string
  testnet: boolean
  /** Warna penanda kecil di samping nama jaringan (bukan satu-satunya pembeda). */
  color: string
}

export const KNOWN_NETWORKS: readonly NetworkInfo[] = [
  { chainId: 1, name: 'Ethereum', testnet: false, color: '#8EA2FF' },
  { chainId: 10, name: 'OP Mainnet', testnet: false, color: '#FF7A7A' },
  { chainId: 137, name: 'Polygon PoS', testnet: false, color: '#B48CFF' },
  { chainId: 8453, name: 'Base', testnet: false, color: '#5B8CFF' },
  { chainId: 42161, name: 'Arbitrum One', testnet: false, color: '#63B8F2' },
  { chainId: 11155111, name: 'Sepolia', testnet: true, color: '#D9C27A' },
  { chainId: 84532, name: 'Base Sepolia', testnet: true, color: '#7FA6E8' },
]

const BY_CHAIN_ID = new Map(KNOWN_NETWORKS.map((network) => [network.chainId, network]))

export function getNetwork(chainId: number): NetworkInfo {
  return (
    BY_CHAIN_ID.get(chainId) ?? {
      chainId,
      name: `Jaringan tidak dikenal (${chainId})`,
      testnet: false,
      color: '#8C9AAD',
    }
  )
}

export function isKnownChain(chainId: number): boolean {
  return BY_CHAIN_ID.has(chainId)
}
