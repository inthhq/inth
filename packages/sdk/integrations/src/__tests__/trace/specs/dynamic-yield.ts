import { dynamicYield } from '../../../vendors/functional/dynamic-yield';
import type { TraceSpec } from '../harness';

// Both DY files read the globals the helper sets; neither defines anything
// the helper calls.
export const dynamicYieldTrace: TraceSpec = {
	granted: { experience: true },
	name: 'dynamic-yield',
	scenarios: [
		{
			name: 'revoke before api_dynamic.js loads',
			start: 'granted',
			steps: ['deny', 'load-detached', 'grant', 'load', 'dispose'],
		},
	],
	script: () =>
		dynamicYield({
			recommendationContext: { data: ['sku-1'], type: 'PRODUCT' },
			sectionId: '8765432',
		}),
};

/**
 * With only options a dashboard can set: no page context, which is page
 * data a site passes in code, and the EU data center.
 */
export const dynamicYieldDashboardTrace: TraceSpec = {
	...dynamicYieldTrace,
	name: 'dynamic-yield.dashboard',
	script: () => dynamicYield({ region: 'eu', sectionId: '8765432' }),
};

export const traces = [dynamicYieldTrace, dynamicYieldDashboardTrace];
