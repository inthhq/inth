import { createConsentKernel } from '@inth/sdk-core';
import { expect, it } from 'vite-plus/test';

import { readSelection } from '../../core/read-selection';
import { policyResolution } from '../helpers/kernel';

it("shows a category on under a 'none' policy, as the evaluator allows it", () => {
	const kernel = createConsentKernel({
		initialPolicyResolution: policyResolution({
			model: 'none',
			prompt: 'none',
		}),
	});
	const snapshot = kernel.getSnapshot();

	expect(snapshot.effectivePermissions.marketing).toBe(true);
	expect(readSelection(snapshot, {}, 'marketing')).toBe(true);
	kernel.dispose();
});
