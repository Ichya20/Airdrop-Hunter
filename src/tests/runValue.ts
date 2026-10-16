import { runValueMarketTests } from './value-market.test'
import { runValuePolicyTests } from './value-policy.test'
import { runValueRewardTests } from './value-rewards.test'
import { runDiscoverySourceTests } from './discovery-sources.test'
import { runDiscoveryRewardTests } from './discovery-rewards.test'
import { runDiscoveryCostTests } from './discovery-cost.test'
import { runDiscoveryIntegrationTests } from './discovery-integration.test'
import { runStage4DashboardTests } from './tahap4-dashboard.test'
import { runCleanupSourceTests } from './cleanup-source.test'

export async function runAllTests(): Promise<void> {
  let passed = 0
  for (const run of [runValueMarketTests, runValuePolicyTests, runValueRewardTests,
    runDiscoverySourceTests, runDiscoveryRewardTests, runDiscoveryCostTests,
    runDiscoveryIntegrationTests, runStage4DashboardTests, runCleanupSourceTests]) {
    const result = await run()
    result.details.forEach((detail) => console.log(detail))
    passed += result.passed
  }
  console.log(`\n${passed} skenario patch free bernilai lulus.`)
}
