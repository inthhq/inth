import { pendo } from '../../../vendors/analytics/pendo';
import type { TraceSpec } from '../harness';

const noop = () => undefined;

export const pendoTrace: TraceSpec = {
	granted: { measurement: true },
	name: 'pendo',
	onFileLoad(_src, stubs) {
		stubs.install(
			'pendo',
			stubs.api('pendo', {
				initialize: noop,
				isSendingEvents: () => true,
				startSendingEvents: noop,
				stopSendingEvents: noop,
			})
		);
	},
	script: () =>
		pendo({
			account: { id: 'account-1' },
			apiKey: 'api-key',
			visitor: { id: 'visitor-1' },
		}),
};

export const traces = [pendoTrace];
