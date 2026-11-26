import { vercelSpeedInsights } from '../../../vendors/analytics/vercel-speed-insights';
import type { VercelSpeedInsightsBeforeSend } from '../../../vendors/analytics/vercel-speed-insights';
import type { TraceScenario, TraceSpec, TraceStep } from '../harness';

type SiQueue = [string, VercelSpeedInsightsBeforeSend][];

let beforeSend: VercelSpeedInsightsBeforeSend | undefined;

// script.js starts once per page, guarded by `window.sil`, swaps the `si`
// stub for a setter and replays `siq`.
const startCollector: NonNullable<TraceSpec['onFileLoad']> = (_src, stubs) => {
	if (stubs.win.sil) {
		return;
	}
	stubs.install('sil', true);
	const si = stubs.fn('si', (action, handler) => {
		if (action === 'beforeSend') {
			beforeSend = handler as VercelSpeedInsightsBeforeSend;
		}
	});
	stubs.install('si', si);
	for (const [action, handler] of (stubs.win.siq as SiQueue | undefined) ??
		[]) {
		si(action, handler);
	}
};

/** The collector reports a vital through the `beforeSend` it holds. */
const sendVital: TraceStep = {
	label: 'collector sends a vital',
	run({ stubs }) {
		const event = { type: 'vital', url: 'https://example.com/' } as const;
		stubs.note({
			vital: beforeSend ? stubs.json(beforeSend(event)) : '[no collector]',
		});
	},
};

const scenarios: TraceScenario[] = [
	{
		name: 'reports follow consent',
		start: 'denied',
		steps: [
			'grant',
			'load',
			sendVital,
			'deny',
			sendVital,
			'grant',
			sendVital,
			'dispose',
			sendVital,
		],
	},
	{
		name: 'revoke before the collector starts',
		start: 'granted',
		steps: ['deny', 'load-detached', sendVital, 'grant', sendVital, 'dispose'],
	},
	{
		name: 'replacement keeps reporting',
		start: 'granted',
		steps: ['load', 'replace', sendVital, 'dispose'],
	},
];

const setup = () => {
	beforeSend = undefined;
};

export const vercelSpeedInsightsTrace: TraceSpec = {
	granted: { measurement: true },
	name: 'vercel-speed-insights',
	onFileLoad: startCollector,
	scenarios,
	script: () => vercelSpeedInsights({ sampleRate: 0.5 }),
	setup,
};

/** With the npm-only `beforeSend` the site passes. */
export const vercelSpeedInsightsBeforeSendTrace: TraceSpec = {
	...vercelSpeedInsightsTrace,
	name: 'vercel-speed-insights.before-send',
	script: (stubs) =>
		vercelSpeedInsights({
			beforeSend: stubs.fn('beforeSend', (event) => ({
				...(event as object),
				route: '/[slug]',
			})) as VercelSpeedInsightsBeforeSend,
			sampleRate: 0.5,
		}),
};

export const traces = [
	vercelSpeedInsightsTrace,
	vercelSpeedInsightsBeforeSendTrace,
];
