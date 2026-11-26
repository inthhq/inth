import { pendo } from '../../../vendors/analytics/pendo';
import type { TracePage, TraceSpec } from '../harness';

const noop = () => undefined;

// Set by a scenario step: the next `initialize` withdraws consent before it
// returns, as a page's consent listener reacting to Pendo starting can.
let withdrawDuringInitialize: TracePage | undefined;

export const pendoTrace: TraceSpec = {
	granted: { measurement: true },
	name: 'pendo',
	onFileLoad(_src, stubs) {
		stubs.install(
			'pendo',
			stubs.api('pendo', {
				initialize() {
					const page = withdrawDuringInitialize;
					withdrawDuringInitialize = undefined;
					page?.save({});
				},
				isSendingEvents: () => true,
				startSendingEvents: noop,
				stopSendingEvents: noop,
			})
		);
	},
	scenarios: [
		{
			name: 'consent withdrawn inside initialize on the first regrant',
			start: 'granted',
			steps: [
				'deny',
				'load',
				{
					label: 'arm a withdrawal inside initialize',
					run(page) {
						withdrawDuringInitialize = page;
					},
				},
				'grant',
				'dispose',
			],
		},
	],
	script: () =>
		pendo({
			account: { id: 'account-1' },
			apiKey: 'api-key',
			visitor: { id: 'visitor-1' },
		}),
	setup() {
		withdrawDuringInitialize = undefined;
	},
};

export const traces = [pendoTrace];
