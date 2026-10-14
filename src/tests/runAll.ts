import { runStage2Tests } from './tahap2.test'
import { runStage3Tests } from './tahap3.test'
import { runCleanupStorageTests } from './cleanup-storage.test'
import { runCleanupRetryTests } from './cleanup-retry.test'
import { runCleanupSourceTests } from './cleanup-source.test'
import { runCleanupScannerTests } from './cleanup-scanner.test'

export async function runAllTests(): Promise<void> {
  let passed = 0
  for (const run of [runStage2Tests, runStage3Tests, runCleanupStorageTests, runCleanupRetryTests, runCleanupSourceTests, runCleanupScannerTests]) {
    const result = await run()
    for (const detail of result.details) console.log(detail)
    passed += result.passed
  }
  console.log(`\n${passed} skenario lulus.`)
}
