import { adrollPixel } from '../../../vendors/ads-and-pixels/adroll';
import type { TraceSpec } from '../harness';

const noop = () => undefined;

// The file replaces the queue with its runtime, as the lifecycle suite's
// replacement object does.
export const adrollTrace: TraceSpec = {
	granted: { marketing: true },
	name: 'adroll',
	onFileLoad(_src, stubs) {
		stubs.install(
			'adroll',
			stubs.api('adroll', {
				identify: noop,
				setProperties: noop,
				track: noop,
			})
		);
	},
	script: () => adrollPixel({ advertiserId: 'advertiser', pixelId: 'pixel' }),
};

export const traces = [adrollTrace];
