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

export const traces = [dynamicYieldTrace];
