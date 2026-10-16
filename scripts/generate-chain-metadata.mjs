import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as chains from 'viem/chains'

// Run again after updating viem; preserve every exported alias, including testnets.
const require = createRequire(import.meta.url)
const packagePath = require.resolve('viem/package.json')
const { version } = JSON.parse(await readFile(packagePath, 'utf8'))
const license = await readFile(resolve(dirname(packagePath), 'LICENSE'), 'utf8')
const metadata = Object.entries(chains).flatMap(([exportName, chain]) => (
  typeof chain === 'object' && chain !== null && typeof chain.id === 'number' && typeof chain.name === 'string'
    ? [{ exportName, id: chain.id, name: chain.name, testnet: chain.testnet === true }]
    : []
))
const header = `// Generated from viem ${version} by: node scripts/generate-chain-metadata.mjs
// Only discovery metadata is shipped; RPC URLs, contracts and chain formatters stay out of the browser bundle.
/*
${license.trim()}
*/

export interface KnownEvmChain {
  exportName: string
  id: number
  name: string
  testnet: boolean
}

export const KNOWN_EVM_CHAINS: readonly KnownEvmChain[] = [
`
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/adapters/sources/knownChains.ts')
await writeFile(outputPath, `${header}${metadata.map((chain) => `  ${JSON.stringify(chain)},`).join('\n')}\n]\n`)
console.log(`Generated ${metadata.length} chain aliases from viem ${version}.`)
