import { cloudflareZaraz } from '../../../vendors/tag-managers/cloudflare-zaraz';
import type { TraceStep, TraceSpec, TraceStubs } from '../harness';

// Zaraz runs from Cloudflare's edge, not from a tag the helper inserts. Its
// consent API lists every purpose, including one the site did not map.
const installConsentApi = (stubs: TraceStubs) => {
	const permissions: Record<string, boolean> = {
		'p-ads': false,
		'p-analytics': false,
		'p-other': true,
	};
	stubs.install('zaraz', {
		consent: {
			APIReady: true,
			getAll: () => ({ ...permissions }),
			modal: true,
			sendQueuedEvents: stubs.fn('zaraz.consent.sendQueuedEvents'),
			set: stubs.fn('zaraz.consent.set', (next) => {
				Object.assign(permissions, next);
			}),
		},
	});
};

const apiReady: TraceStep = {
	label: 'the Zaraz consent API becomes ready',
	run({ stubs }) {
		installConsentApi(stubs);
		document.dispatchEvent(new Event('zarazConsentAPIReady'));
	},
};

const options = {
	purposes: { marketing: ['p-ads'], measurement: ['p-analytics'] },
} as const;

export const cloudflareZarazTrace: TraceSpec = {
	granted: { marketing: true, measurement: true },
	name: 'cloudflare-zaraz',
	scenarios: [
		{
			name: 'one mapped category changes',
			start: 'granted',
			steps: [
				{ consent: { marketing: true }, label: 'revoke measurement' },
				{
					consent: { marketing: true, measurement: true },
					label: 'grant measurement',
				},
				'dispose',
			],
		},
	],
	script: () => cloudflareZaraz(options),
	setup: installConsentApi,
};

/** The consent API arrives after the helper registers. */
export const cloudflareZarazLateApiTrace: TraceSpec = {
	granted: { marketing: true, measurement: true },
	name: 'cloudflare-zaraz.late-api',
	scenarios: [
		{
			name: 'the API becomes ready while granted',
			start: 'granted',
			steps: [apiReady, 'deny', 'dispose'],
		},
		{
			name: 'the API becomes ready while denied',
			start: 'denied',
			steps: [apiReady, 'grant', 'dispose'],
		},
		{
			name: 'the API becomes ready after dispose',
			start: 'granted',
			steps: ['dispose', apiReady],
		},
	],
	script: () => cloudflareZaraz(options),
	standardScenarios: false,
};

export const traces = [cloudflareZarazTrace, cloudflareZarazLateApiTrace];
