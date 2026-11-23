import { runFrameworkConformance } from '../../../react/src/__tests__/framework-conformance';
import { InthProvider } from '../inth-provider';
import { createPolicySession, probePolicyContract } from './policy-driver';
import { policyFixture } from './policy-fixture';

runFrameworkConformance({
	Root: InthProvider,
	createPolicySession,
	framework: 'tanstack-start',
	policyFixture,
	probePolicyContract,
});
