import { runStage2Tests } from './tahap2.test'
import { runStage4AdapterTests } from './tahap4-adapter.test'
import { runStage4StorageTests } from './tahap4-storage.test'
import { runStage4FlowTests } from './tahap4-flow.test'
import { runStage4DashboardTests } from './tahap4-dashboard.test'

/** Tes patch saja: tanpa entry aplikasi, server, wallet, atau akses RPC nyata. */
export async function runAllTests(): Promise<void> {
  let passed = 0
  for (const run of [runStage2Tests, runStage4AdapterTests, runStage4StorageTests, runStage4FlowTests, runStage4DashboardTests]) {
    const result = await run()
    result.details.forEach((detail) => console.log(detail))
    passed += result.passed
  }
  console.log(`\n${passed} skenario patch Tahap 4 lulus.`)
}
