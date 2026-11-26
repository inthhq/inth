import { gainsightPx } from '../../../vendors/analytics/gainsight-px';
import type { TraceSpec } from '../harness';

// The SDK bundle replaces the queue stub with its own function and marks
// that it started, as the e2e suite's runtime does.
export const gainsightPxTrace: TraceSpec = {
	granted: { measurement: true },
	name: 'gainsight-px',
	onFileLoad(_src, stubs) {
		stubs.install(
			'aptrinsic',
			Object.assign(stubs.fn('aptrinsic'), { __sdkBundleStarted: true })
		);
	},
	script: () =>
		gainsightPx({
			account: { id: 'account-1' },
			config: { usePOST: true },
			productKey: 'AP-PRODUCT-KEY',
			user: { email: 'user@example.com', id: 'user-1' },
		}),
};

/** With only the product key, as a dashboard sets it. */
export const gainsightPxDashboardTrace: TraceSpec = {
	...gainsightPxTrace,
	name: 'gainsight-px.dashboard',
	script: () => gainsightPx({ productKey: 'AP-PRODUCT-KEY' }),
};

export const traces = [gainsightPxTrace, gainsightPxDashboardTrace];
