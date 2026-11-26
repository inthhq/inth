import { amazonAdsTag } from '../../../vendors/ads-and-pixels/amazon-ads';
import type { AmazonAdsQueueEntry } from '../../../vendors/ads-and-pixels/amazon-ads';
import type { TraceSpec, TraceStubs } from '../harness';

const tagId = '00000000-0000-0000-0000-000000000000';

// amzn.js replaces the queue function and runs what was queued;
// amzn-consent.js defines `amznConsent`.
const runFile = (src: string, stubs: TraceStubs) => {
	if (src.includes('amzn-consent.js')) {
		stubs.install('amznConsent', stubs.fn('amznConsent'));
		return;
	}
	const queue = stubs.win.amzn as { q?: AmazonAdsQueueEntry[] } | undefined;
	const amzn = stubs.fn('amzn');
	stubs.install('amzn', amzn);
	for (const [args] of queue?.q ?? []) {
		amzn(...Array.from(args));
	}
};

/** With a country code, which loads Amazon's consent helper first. */
export const amazonAdsTrace: TraceSpec = {
	granted: { marketing: true },
	name: 'amazon-ads',
	onFileLoad: runFile,
	scenarios: [
		{
			name: 'revoke before the consent helper loads',
			start: 'granted',
			steps: ['deny', 'load-detached', 'grant', 'load', 'dispose'],
		},
	],
	script: () =>
		amazonAdsTag({
			countryCode: 'de',
			pageViewAttributes: { page: 'home' },
			region: 'EU',
			tagId,
		}),
};

/** Without a country code: no consent helper, the queue starts at once. */
export const amazonAdsNoCountryTrace: TraceSpec = {
	granted: { marketing: true },
	name: 'amazon-ads.no-country',
	onFileLoad: runFile,
	script: () => amazonAdsTag({ tagId }),
};

export const traces = [amazonAdsTrace, amazonAdsNoCountryTrace];
