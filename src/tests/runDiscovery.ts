import { runDiscoverySourceTests } from './discovery-sources.test'
import { runDiscoveryRewardTests } from './discovery-rewards.test'
import { runDiscoveryCostTests } from './discovery-cost.test'
import { runDiscoveryIntegrationTests } from './discovery-integration.test'

export async function runAllTests(): Promise<void> {
  let passed = 0
  for (const run of [runDiscoverySourceTests, runDiscoveryRewardTests, runDiscoveryCostTests, runDiscoveryIntegrationTests]) {
    const result = await run()
    result.details.forEach((detail) => console.log(detail))
    passed += result.passed
  }
  console.log(`\n${passed} skenario discovery lulus.`)
}
