import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'

// Bundle suite TypeScript untuk Node, tanpa server HTTP, API live, atau wallet nyata.
const outDir = resolve('node_modules/.tmp/tests')
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: resolve('src/tests/runAll.ts'),
    target: 'node20',
    outDir,
    emptyOutDir: false,
    rolldownOptions: { external: ['viem'], output: { entryFileNames: 'runner.mjs' } },
  },
})
const { runAllTests } = await import(pathToFileURL(resolve(outDir, 'runner.mjs')).href)
await runAllTests()
