import { customerIo } from '../../../vendors/email-and-sms/customer-io';
import type { TraceSpec } from '../harness';

const noop = () => undefined;

// analytics.js replaces the queue array with its API.
export const customerIoTrace: TraceSpec = {
	granted: { marketing: true },
	name: 'customer-io',
	onFileLoad(_src, stubs) {
		stubs.install(
			'cioanalytics',
			stubs.api('cioanalytics', {
				identify: noop,
				page: noop,
				reset: noop,
				track: noop,
			})
		);
	},
	script: () =>
		customerIo({ loadOptions: { integrations: {} }, writeKey: 'write-key' }),
};

/** Only options a dashboard can set, for the server path's run. */
export const customerIoDashboardTrace: TraceSpec = {
	...customerIoTrace,
	name: 'customer-io.dashboard',
	script: () => customerIo({ writeKey: 'write-key' }),
};

export const traces = [customerIoTrace, customerIoDashboardTrace];
