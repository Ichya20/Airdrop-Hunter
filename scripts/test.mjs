import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'

// Bundle suite TypeScript untuk Node, tanpa server HTTP, API live, atau wallet nyata.
const outDir = resolve('node_modules/.tmp/tests')
const stage4Only = process.argv.includes('--stage4')
const discoveryOnly = process.argv.includes('--discovery')
const valueOnly = process.argv.includes('--value')
const runner = valueOnly ? 'value-runner.mjs' : discoveryOnly ? 'discovery-runner.mjs' : stage4Only ? 'stage4-runner.mjs' : 'runner.mjs'
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: resolve(valueOnly ? 'src/tests/runValue.ts' : discoveryOnly ? 'src/tests/runDiscovery.ts' : stage4Only ? 'src/tests/runStage4.ts' : 'src/tests/runAll.ts'),
    target: 'node20',
    outDir,
    emptyOutDir: false,
    rolldownOptions: { external: ['viem', 'viem/accounts', 'viem/chains', 'react'], output: { entryFileNames: runner } },
  },
})
const { runAllTests } = await import(pathToFileURL(resolve(outDir, runner)).href)
await runAllTests()
