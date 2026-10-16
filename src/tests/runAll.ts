import { runStage2Tests } from './tahap2.test'
import { runStage3Tests } from './tahap3.test'
import { runCleanupStorageTests } from './cleanup-storage.test'
import { runCleanupRetryTests } from './cleanup-retry.test'
import { runCleanupSourceTests } from './cleanup-source.test'
import { runCleanupScannerTests } from './cleanup-scanner.test'
import { runStage4AdapterTests } from './tahap4-adapter.test'
import { runStage4StorageTests } from './tahap4-storage.test'
import { runStage4FlowTests } from './tahap4-flow.test'
import { runStage4DashboardTests } from './tahap4-dashboard.test'
import { runDiscoverySourceTests } from './discovery-sources.test'
import { runDiscoveryRewardTests } from './discovery-rewards.test'
import { runDiscoveryCostTests } from './discovery-cost.test'
import { runDiscoveryIntegrationTests } from './discovery-integration.test'
import { runValueMarketTests } from './value-market.test'
import { runValuePolicyTests } from './value-policy.test'
import { runValueRewardTests } from './value-rewards.test'
import { runMarketPerformanceTests } from './performance-market.test'
import { runResultsPerformanceTests } from './results-performance.test'

export async function runAllTests(): Promise<void> {
  let passed = 0
  for (const run of [runStage2Tests, runStage3Tests, runCleanupStorageTests, runCleanupRetryTests, runCleanupSourceTests, runCleanupScannerTests, runStage4AdapterTests, runStage4StorageTests, runStage4FlowTests, runStage4DashboardTests, runDiscoverySourceTests, runDiscoveryRewardTests, runDiscoveryCostTests, runDiscoveryIntegrationTests]) {
    const result = await run()
    for (const detail of result.details) console.log(detail)
    passed += result.passed
  }
  for (const run of [runValueMarketTests, runValuePolicyTests, runValueRewardTests, runMarketPerformanceTests, runResultsPerformanceTests]) {
    const result = await run()
    result.details.forEach((detail) => console.log(detail))
    passed += result.passed
  }
  console.log(`\n${passed} skenario lulus.`)
}
