import { zendeskWidget } from '../../../vendors/functional/zendesk';
import type { TraceSpec } from '../harness';

export const zendeskTrace: TraceSpec = {
	granted: { functionality: true },
	name: 'zendesk',
	onFileLoad(_src, stubs) {
		stubs.install('zE', stubs.fn('zE'));
	},
	scenarios: [
		{
			name: 'measurement changes the cookie range',
			start: 'granted',
			steps: [
				'load',
				{
					consent: { functionality: true, measurement: true },
					label: 'grant measurement',
				},
				{ consent: { functionality: true }, label: 'revoke measurement' },
				'dispose',
			],
		},
	],
	script: () => zendeskWidget({ key: 'widget-key' }),
};

export const traces = [zendeskTrace];
